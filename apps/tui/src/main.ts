#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import {
  BoxRenderable,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  type KeyEvent,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextAttributes,
  TextRenderable,
} from '@opentui/core';
import {
  type AgentMessage,
  type AgentSession,
  type Clock,
  type ConversationLog,
  type ConversationTurn,
  emptyMemory,
  parseDemoScript,
  planAndRun,
  type Presenter,
  type RunEvent,
  runScript,
} from '@ayd/core';
import { createPlaywrightDriver, launchDemoBrowser, type PlaywrightDriver } from '@ayd/engine';
import { createClaudeAgentPlanner, createInteractiveAgent } from '@ayd/planner';
import type { Browser } from 'playwright';
import { buildAgentMemory } from './agent-memory.js';
import { createFileConversationStore, newConversationId } from './conversation-store.js';
import {
  applyStoredToken,
  clearToken,
  keychainAvailable,
  loadToken,
  saveToken,
} from './credentials.js';
import { createFileMemoryStore } from './memory-store.js';
import { log, logPath } from './log.js';
import { runPreflight } from './preflight.js';
import { type DemoProfile, loadProfile, saveProfile } from './profile.js';

const C = {
  accent: '#8b7cf6',
  you: '#6d6cf5',
  text: '#e8eaf0',
  muted: '#6b7385',
  err: '#f26363',
  ok: '#34d399',
  surface2: '#232836',
} as const;

const PACE_MS = Number.isFinite(Number(process.env['AYD_PACE_MS']))
  ? Number(process.env['AYD_PACE_MS'])
  : 2500;

const clock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Wrap a string to `width` columns on word boundaries so nothing overflows. */
const wrap = (s: string, width: number): string[] => {
  const out: string[] = [];
  for (const raw of s.split('\n')) {
    let line = '';
    for (const word of raw.split(/\s+/)) {
      if (word === '') continue;
      if (line === '') line = word;
      else if (line.length + 1 + word.length <= width) line += ' ' + word;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out.length > 0 ? out : [''];
};

const shortUrl = (u: string): string => u.replace(/^https?:\/\//, '').slice(0, 40) || 'about:blank';

/** The command palette: name, one-line help, and whether it takes an argument. */
const COMMANDS: readonly { name: string; desc: string; arg: boolean }[] = [
  { name: '/plan', desc: 'plan a demo from a description, then run it', arg: true },
  { name: '/run', desc: 'run a saved DemoScript JSON file', arg: true },
  { name: '/sessions', desc: 'list saved conversations', arg: false },
  { name: '/view', desc: 'print a past conversation (read-only)', arg: true },
  { name: '/resume', desc: 're-open a past session and continue it', arg: true },
  { name: '/memory', desc: 'show the feature-map/memory for this app', arg: false },
  { name: '/box', desc: 'show/hide the in-page chat box', arg: false },
  { name: '/token', desc: 'store an encrypted Claude token, or show status', arg: true },
  { name: '/config', desc: 'show or edit settings (url / personas)', arg: true },
  { name: '/stop', desc: 'interrupt the agent, or abort a /plan or /run', arg: false },
  { name: '/end', desc: 'close the live session', arg: false },
  { name: '/quit', desc: 'exit ayd', arg: false },
  { name: '/help', desc: 'list all commands', arg: false },
];

const HELP = [
  'commands:',
  '  <text>          send to the live agent (opens the browser on the first message)',
  '  /plan <desc>    plan a demo from a description, then run it',
  '  /run <path>     run a saved DemoScript JSON file',
  '  /sessions       list saved conversations',
  '  /view <id>      print a past conversation (read-only)',
  '  /resume <id>    reopen a past session — the agent re-achieves its state, then continues',
  '  /memory         show the feature-map/memory for the current app',
  '  /box            show/hide the in-page chat box (during a live session)',
  '  /token [value]  store an encrypted Claude token (keychain), or show status',
  '  /config         show settings · /config set url <u> · set persona <id> <label> <color> · rm persona <id>',
  '  /stop  /end  /quit   interrupt (also aborts a /plan or /run) · close session · exit',
];

const main = async (): Promise<void> => {
  let profile: DemoProfile = await loadProfile();
  const conversationStore = createFileConversationStore();
  const memoryStore = createFileMemoryStore();

  const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 });
  const root = new BoxRenderable(renderer, {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
  });
  renderer.root.add(root);

  const headerText = new TextRenderable(renderer, { content: '', fg: C.accent, flexShrink: 0 });
  root.add(headerText);
  root.add(
    new TextRenderable(renderer, {
      content: 'Enter: send · /help for commands · /stop /end /quit',
      fg: C.muted,
      flexShrink: 0,
    }),
  );
  const refreshHeader = (): void => {
    headerText.content = `ayd · ${profile.baseUrl} · personas: ${profile.personas.map((p) => p.id).join(', ')}`;
    renderer.requestRender();
  };
  refreshHeader();

  const transcript = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    flexShrink: 1,
    width: '100%',
    border: true,
    title: 'live agent',
    stickyScroll: true,
    stickyStart: 'bottom',
  });
  root.add(transcript);

  const tabsLine = new TextRenderable(renderer, { content: '', fg: C.muted, flexShrink: 0 });
  root.add(tabsLine);

  // Clickable button bar, grouped like the old desktop app: chat controls · run · panels.
  // Actions reference functions defined below; the closures only run on click, by which
  // point everything is initialised. Buttons complement the keyboard/slash-command flow.
  const makeBtn = (label: string, onClick: () => void, primary = false): TextRenderable => {
    const base = primary ? C.accent : C.surface2;
    const off = primary ? C.text : C.muted;
    const b = new TextRenderable(renderer, {
      content: ` ${label} `,
      fg: off,
      bg: base,
      flexShrink: 0,
      onMouseDown: () => onClick(),
      onMouseOver: () => {
        b.bg = C.accent;
        b.fg = C.text;
        renderer.requestRender();
      },
      onMouseOut: () => {
        b.bg = base;
        b.fg = off;
        renderer.requestRender();
      },
    });
    return b;
  };
  const sep = (): TextRenderable =>
    new TextRenderable(renderer, { content: ' · ', fg: C.muted, flexShrink: 0 });
  const buttonBar = new BoxRenderable(renderer, {
    width: '100%',
    flexShrink: 0,
    flexDirection: 'row',
    gap: 1,
  });
  [
    makeBtn('Send', () => submit(input.value), true),
    makeBtn('Interrupt', () => stop()),
    makeBtn('End', () => void endSession().then(() => line('— session ended —', C.muted))),
    sep(),
    makeBtn('Plan…', () => prefill('/plan ')),
    makeBtn('Run…', () => prefill('/run ')),
    sep(),
    makeBtn('Sessions', () => void sessionsMenu()),
    makeBtn('Memory', () => void memoryMenu()),
    makeBtn('Settings', () => settingsMenu()),
  ].forEach((b) => buttonBar.add(b));
  root.add(buttonBar);

  // Command autocomplete: a bordered panel above the input, filtered as you type '/'.
  const suggestBox = new BoxRenderable(renderer, {
    width: '100%',
    flexShrink: 0,
    border: true,
    borderStyle: 'rounded',
    borderColor: C.accent,
    title: 'commands',
    visible: false,
  });
  root.add(suggestBox);

  const input = new InputRenderable(renderer, {
    width: '100%',
    flexShrink: 0,
    placeholder: 'tell the agent what to demo…  (type / for commands)',
  });
  root.add(input);
  input.focus();

  // ---- command autocomplete ----------------------------------------------
  let matches: readonly { name: string; desc: string; arg: boolean }[] = [];
  let selected = 0;
  const renderSuggest = (): void => {
    const v = input.value;
    // Only while typing the command token itself (a leading '/', no space yet).
    if (!v.startsWith('/') || v.includes(' ')) {
      matches = [];
      suggestBox.visible = false;
      renderer.requestRender();
      return;
    }
    matches = COMMANDS.filter((c) => c.name.startsWith(v));
    if (matches.length === 0) {
      suggestBox.visible = false;
      renderer.requestRender();
      return;
    }
    if (selected >= matches.length) selected = 0;
    suggestBox.getChildren().forEach((c) => c.destroyRecursively());
    matches.forEach((m, i) => {
      const on = i === selected;
      suggestBox.add(
        new TextRenderable(renderer, {
          content: `${on ? '▸ ' : '  '}${m.name.padEnd(10)} ${m.desc}`,
          fg: on ? C.text : C.muted,
          ...(on ? { attributes: TextAttributes.BOLD } : {}),
        }),
      );
    });
    suggestBox.visible = true;
    renderer.requestRender();
  };
  const acceptSuggest = (): void => {
    const m = matches[selected];
    if (!m) return;
    input.value = m.arg ? `${m.name} ` : m.name;
    renderSuggest();
  };

  input.on(InputRenderableEvents.INPUT, () => {
    selected = 0;
    renderSuggest();
  });
  // Tab completes the highlighted command; ↑/↓ move the selection. Global listeners
  // run before the focused input, so stopPropagation keeps these keys out of the text.
  renderer.keyInput.on('keypress', (key: KeyEvent) => {
    if (menuOpen) {
      // The focused Select handles ↑/↓/Enter; Esc backs out of the menu.
      if (key.name === 'escape') {
        closeMenu();
        key.stopPropagation();
      }
      return;
    }
    if (matches.length === 0) return;
    if (key.name === 'tab') {
      acceptSuggest();
      key.stopPropagation();
    } else if (key.name === 'down') {
      selected = (selected + 1) % matches.length;
      renderSuggest();
      key.stopPropagation();
    } else if (key.name === 'up') {
      selected = (selected - 1 + matches.length) % matches.length;
      renderSuggest();
      key.stopPropagation();
    }
  });

  const line = (content: string, fg: string = C.text): void => {
    for (const l of wrap(content, Math.max(20, renderer.width - 2))) {
      transcript.add(new TextRenderable(renderer, { content: l, fg }));
    }
    renderer.requestRender();
  };

  // ---- live chat session state -------------------------------------------
  let session: AgentSession | null = null;
  let browser: Browser | null = null;
  let driver: PlaywrightDriver | null = null;
  let starting = false;
  let boxVisible = true;
  // A one-shot /plan or /run, abortable via /stop.
  let activeRun: { controller: AbortController; browser: Browser } | null = null;
  // Menu/prompt UI state.
  let menuOpen = false;
  let promptMode: { onValue: (v: string) => void } | null = null;

  interface SessionState {
    id: string;
    startedAt: string;
    title: string;
    turns: ConversationTurn[];
  }
  let sessionState: SessionState | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let tabTimer: ReturnType<typeof setInterval> | null = null;

  const saveConversation = async (): Promise<void> => {
    if (!sessionState || sessionState.turns.length === 0) return;
    await conversationStore
      .save({
        id: sessionState.id,
        startedAt: sessionState.startedAt,
        updatedAt: new Date().toISOString(),
        baseUrl: profile.baseUrl,
        title: sessionState.title,
        turns: sessionState.turns,
      })
      .catch(() => undefined);
  };
  const scheduleSave = (): void => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveConversation();
    }, 1500);
  };

  const renderMsg = (m: AgentMessage): void => {
    if (m.kind === 'assistant') line(m.text, C.text);
    else if (m.kind === 'action')
      line(`  › ${m.tool}${m.detail !== undefined ? ` ${m.detail}` : ''}`, C.accent);
    else if (m.kind === 'status') {
      if (!m.text.startsWith('you:')) line(m.text, C.muted);
    } else if (m.kind === 'error') line(`✗ ${m.text}`, C.err);
    else line('— turn complete — send the next step', C.muted);
  };

  const stopTabs = (): void => {
    if (tabTimer) {
      clearInterval(tabTimer);
      tabTimer = null;
    }
    tabsLine.content = '';
    renderer.requestRender();
  };

  const endSession = async (): Promise<void> => {
    stopTabs();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await saveConversation();
    await session?.end().catch(() => undefined);
    await driver?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    session = null;
    driver = null;
    browser = null;
    sessionState = null;
  };

  /** Start the live agent (or send the next message to a running one). */
  const startOrSend = async (firstMessage: string, title = firstMessage): Promise<void> => {
    if (session) {
      line(`you: ${firstMessage}`, C.you);
      session.send(firstMessage);
      return;
    }
    if (activeRun) {
      line('a /plan or /run is in progress — /stop it first', C.err);
      return;
    }
    if (starting) return;
    starting = true;
    line(`you: ${firstMessage}`, C.you);
    line('opening the browser…', C.muted);
    log.info('session:start', { baseUrl: profile.baseUrl });
    try {
      await applyStoredToken();
      const launched = await launchDemoBrowser();
      browser = launched.browser;
      line(`browser: ${launched.info.name}`, C.muted);
      log.info('browser', launched.info.name);
      driver = createPlaywrightDriver({
        browser,
        personas: profile.personas,
        baseUrl: profile.baseUrl,
      });
      const memory = await buildAgentMemory(memoryStore, profile.baseUrl);
      sessionState = {
        id: newConversationId(),
        startedAt: new Date().toISOString(),
        title: title.slice(0, 80),
        turns: [],
      };
      driver.onOperatorMessage((t) => session?.send(t));
      const activeDriver = driver;
      session = createInteractiveAgent({ driver, memory }).start({
        personas: profile.personas,
        baseUrl: profile.baseUrl,
        firstMessage,
        onMessage: (m) => {
          sessionState?.turns.push({ at: new Date().toISOString(), message: m });
          renderMsg(m);
          void activeDriver.push(m);
          scheduleSave();
          log.debug('agent', m);
        },
      });
      const first = profile.personas[0];
      if (first) await driver.bringToFront(first.id).catch(() => undefined);
      boxVisible = true;
      await driver.setVisible(true).catch(() => undefined);
      // Poll per-tab progress while the session is live.
      tabTimer = setInterval(() => {
        void activeDriver
          .listTabs()
          .then((tabs) => {
            tabsLine.content =
              tabs.length > 0
                ? 'tabs · ' + tabs.map((t) => `${t.personaId}: ${shortUrl(t.url)}`).join('  ·  ')
                : '';
            renderer.requestRender();
          })
          .catch(() => undefined);
      }, 1500);
    } catch (e) {
      line(`✗ could not start: ${String(e)}`, C.err);
      log.error('session:start failed', e);
      await endSession();
    } finally {
      starting = false;
    }
  };

  // ---- one-shot runs (plan / run), abortable ------------------------------
  const presenter: Presenter = {
    emit: (e: RunEvent) => {
      if (e.type === 'run-started') line(`▶ run started — ${String(e.totalSteps)} steps`, C.text);
      else if (e.type === 'step-started')
        line(`  · [${String(e.index)}] ${e.step.action}`, C.muted);
      else if (e.type === 'step-succeeded') line(`  ✓ [${String(e.index)}] ${e.step.action}`, C.ok);
      else if (e.type === 'step-failed')
        line(`  ✗ [${String(e.index)}] ${e.step.action} — ${e.reason}`, C.err);
      else
        line(
          `■ done — ${String(e.report.succeeded)}/${String(e.report.total)} ok, ${String(e.report.failed)} failed`,
          C.text,
        );
    },
  };

  const withRun = async (
    body: (d: PlaywrightDriver, signal: AbortSignal) => Promise<void>,
  ): Promise<void> => {
    if (session || activeRun) {
      line('busy — end the current session/run first (/end or /stop)', C.err);
      return;
    }
    const controller = new AbortController();
    let b: Browser | null = null;
    let d: PlaywrightDriver | null = null;
    try {
      const launched = await launchDemoBrowser();
      b = launched.browser;
      activeRun = { controller, browser: b };
      d = createPlaywrightDriver({
        browser: b,
        personas: profile.personas,
        baseUrl: profile.baseUrl,
      });
      await body(d, controller.signal);
    } catch (e) {
      line(`✗ ${String(e)}`, C.err);
      log.error('run failed', e);
    } finally {
      await d?.close().catch(() => undefined);
      await b?.close().catch(() => undefined);
      activeRun = null;
    }
  };

  const runScriptFile = async (path: string): Promise<void> => {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      line(`✗ cannot read ${path}: ${String(e)}`, C.err);
      return;
    }
    const parsed = parseDemoScript(raw);
    if (!parsed.ok) {
      for (const i of parsed.error) line(`  ✗ ${i.path}: ${i.message}`, C.err);
      return;
    }
    await withRun((d, signal) =>
      runScript(parsed.value, { driver: d, presenter, clock, paceMs: PACE_MS, signal }).then(
        () => undefined,
      ),
    );
  };

  const planAndRunDesc = async (description: string): Promise<void> => {
    await applyStoredToken();
    await withRun(async (d, signal) => {
      const result = await planAndRun(
        { description, personas: profile.personas, baseUrl: profile.baseUrl },
        {
          planner: createClaudeAgentPlanner(),
          driver: d,
          presenter,
          clock,
          paceMs: PACE_MS,
          signal,
        },
      );
      if (!result.ok) {
        line(`✗ plan failed: ${result.error.message}`, C.err);
        for (const i of result.error.issues ?? []) line(`  ${i}`, C.err);
      }
    });
  };

  // ---- sessions -----------------------------------------------------------
  const renderPast = (m: AgentMessage): void => {
    if (m.kind === 'status' && m.text.startsWith('you: ')) line(`you: ${m.text.slice(5)}`, C.you);
    else renderMsg(m);
  };

  const viewSession = async (id: string): Promise<void> => {
    const log = await conversationStore.load(id);
    if (!log) {
      line(`✗ no session ${id}`, C.err);
      return;
    }
    line(`— ${log.title || id} · ${String(log.turns.length)} msgs —`, C.text);
    for (const t of log.turns) renderPast(t.message);
    line('— end of transcript —', C.muted);
  };

  const continuationSeed = (log: ConversationLog): string => {
    const lines = log.turns
      .map((t) => {
        const m = t.message;
        if (m.kind === 'assistant') return `- ${m.text}`;
        if (m.kind === 'action')
          return `  · ${m.tool}${m.detail !== undefined ? ` ${m.detail}` : ''}`;
        if (m.kind === 'status' && m.text.startsWith('you: '))
          return `- (operator) ${m.text.slice(5)}`;
        return null;
      })
      .filter((l): l is string => l !== null)
      .slice(-40)
      .join('\n');
    return [
      'You are RESUMING an earlier demo session. The browser was closed, so nothing is open yet.',
      'Here is what was done before (oldest to newest):',
      lines,
      'First re-achieve that state: log in as needed and navigate back to where you left off by',
      'observing and clicking real UI (do not guess URLs). Then continue from there.',
    ].join('\n');
  };

  const resumeSession = async (id: string): Promise<void> => {
    const log = await conversationStore.load(id);
    if (!log) {
      line(`✗ no session ${id}`, C.err);
      return;
    }
    line(`resuming ${id} — the agent will re-achieve the previous state…`, C.muted);
    await startOrSend(continuationSeed(log), `resume: ${log.title}`);
  };

  // ---- token --------------------------------------------------------------
  const handleToken = async (value: string): Promise<void> => {
    if (value === '') {
      const set = (await loadToken()) !== null;
      line(
        keychainAvailable()
          ? `token: ${set ? 'set (encrypted in the macOS keychain)' : 'not set — /token <value> to store, else claude login is used'}`
          : 'encrypted token needs the macOS keychain; on this OS run `claude login`',
        C.muted,
      );
      return;
    }
    if (value === 'clear') {
      await clearToken();
      line('token cleared', C.muted);
      return;
    }
    const ok = await saveToken(value);
    line(
      ok ? 'token stored, encrypted in the keychain' : '✗ could not store token (macOS only)',
      ok ? C.ok : C.err,
    );
  };

  // ---- config editor ------------------------------------------------------
  const persist = async (next: DemoProfile): Promise<void> => {
    try {
      const path = await saveProfile(next);
      profile = { ...next, source: path };
      refreshHeader();
      line(`saved profile → ${path}`, C.ok);
    } catch (e) {
      line(`✗ could not save profile: ${String(e)}`, C.err);
    }
  };

  const handleConfig = async (args: readonly string[]): Promise<void> => {
    const [sub, kind, ...rest] = args;
    if (sub === undefined) {
      line(`profile: ${profile.source ?? '(defaults)'}`, C.muted);
      line(`base URL: ${profile.baseUrl}`, C.muted);
      line(`personas: ${profile.personas.map((p) => `${p.id} (${p.label})`).join(', ')}`, C.muted);
      line(`log: ${logPath()}  (tail it to debug; AYD_DEBUG=1 for verbose)`, C.muted);
      line(
        'edit: /config set url <u> · set persona <id> <label> <color> · rm persona <id>',
        C.muted,
      );
      return;
    }
    if (sub === 'set' && kind === 'url' && rest[0] !== undefined) {
      await persist({ ...profile, baseUrl: rest[0] });
      return;
    }
    if (sub === 'set' && kind === 'persona' && rest.length >= 3) {
      const [id, label, color] = rest as [string, string, string];
      const others = profile.personas.filter((p) => p.id !== id);
      await persist({ ...profile, personas: [...others, { id, label, color }] });
      return;
    }
    if (sub === 'rm' && kind === 'persona' && rest[0] !== undefined) {
      const personas = profile.personas.filter((p) => p.id !== rest[0]);
      if (personas.length === 0) {
        line('✗ cannot remove the last persona', C.err);
        return;
      }
      await persist({ ...profile, personas });
      return;
    }
    line(
      'usage: /config · /config set url <u> · set persona <id> <label> <color> · rm persona <id>',
      C.err,
    );
  };

  const toggleBox = async (): Promise<void> => {
    if (!driver) {
      line('no live session — the in-page box appears once a session starts', C.muted);
      return;
    }
    boxVisible = !boxVisible;
    await driver.setVisible(boxVisible).catch(() => undefined);
    line(`in-page box ${boxVisible ? 'shown' : 'hidden'}`, C.muted);
  };

  const stop = (): void => {
    if (session) {
      void session.interrupt();
      line('interrupted — send a message to continue', C.muted);
    } else if (activeRun) {
      activeRun.controller.abort();
      void activeRun.browser.close().catch(() => undefined);
      line('run aborted', C.muted);
    } else line('nothing to stop', C.muted);
  };

  // ---- menus (navigable lists) -------------------------------------------
  // A floating modal that hosts a keyboard-navigable Select. Arrow keys move,
  // Enter picks, Esc backs out — the friendly alternative to slash commands.
  const menuBox = new BoxRenderable(renderer, {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 2,
    bottom: 2,
    zIndex: 50,
    border: true,
    borderStyle: 'rounded',
    borderColor: C.accent,
    title: 'menu',
    backgroundColor: '#0d0f14',
    flexDirection: 'column',
    visible: false,
  });
  root.add(menuBox);

  const closeMenu = (): void => {
    menuOpen = false;
    menuBox.visible = false;
    menuBox.getChildren().forEach((c) => c.destroyRecursively());
    input.focus();
    renderer.requestRender();
  };

  interface MenuItem {
    name: string;
    description?: string;
    value: string;
  }
  const openMenu = (title: string, items: MenuItem[], onPick: (value: string) => void): void => {
    menuBox.getChildren().forEach((c) => c.destroyRecursively());
    menuBox.title = title;
    const sel = new SelectRenderable(renderer, {
      flexGrow: 1,
      width: '100%',
      showDescription: true,
      options: items.map((o) => ({
        name: o.name,
        description: o.description ?? '',
        value: o.value,
      })),
      backgroundColor: '#0d0f14',
      selectedBackgroundColor: C.accent,
    });
    sel.on(SelectRenderableEvents.ITEM_SELECTED, (_i, opt) => {
      const raw = (opt as { value?: unknown }).value;
      closeMenu();
      onPick(typeof raw === 'string' ? raw : '');
    });
    menuBox.add(sel);
    menuBox.add(
      new TextRenderable(renderer, {
        content: '↑/↓ move · Enter select · Esc back',
        fg: C.muted,
        flexShrink: 0,
      }),
    );
    menuOpen = true;
    menuBox.visible = true;
    sel.focus();
    renderer.requestRender();
  };

  // Repurpose the input for a one-line prompt; the next Enter feeds `onValue`.
  const promptInput = (label: string, initial: string, onValue: (v: string) => void): void => {
    line(`✎ ${label}  (Enter to save · empty to cancel)`, C.accent);
    promptMode = { onValue };
    input.value = initial;
    renderSuggest();
    input.focus();
  };

  // -- sessions menu --
  const sessionsMenu = async (): Promise<void> => {
    const list = await conversationStore.list();
    if (list.length === 0) {
      line('no saved conversations yet', C.muted);
      return;
    }
    openMenu(
      'sessions — pick one',
      list.slice(0, 50).map((s) => ({
        name: s.title || '(untitled)',
        description: `${new Date(s.startedAt).toLocaleString()} · ${String(s.turnCount)} msgs`,
        value: s.id,
      })),
      (id) => sessionActionMenu(id),
    );
  };
  const sessionActionMenu = (id: string): void => {
    openMenu(
      `session · ${id}`,
      [
        {
          name: 'Resume',
          description: 'agent re-achieves the state, then continues',
          value: 'resume',
        },
        { name: 'View', description: 'print the transcript (read-only)', value: 'view' },
        { name: 'Delete', description: 'remove this saved conversation', value: 'delete' },
        { name: 'Back', description: 'to the session list', value: 'back' },
      ],
      (v) => {
        if (v === 'resume') void resumeSession(id);
        else if (v === 'view') void viewSession(id);
        else if (v === 'delete')
          void conversationStore.remove(id).then(() => {
            line(`deleted session ${id}`, C.muted);
            void sessionsMenu();
          });
        else void sessionsMenu();
      },
    );
  };

  // -- memory menu --
  const clearMemory = async (): Promise<void> => {
    await memoryStore.save(emptyMemory(profile.baseUrl, new Date().toISOString()));
  };
  const deleteMemoryItem = async (kind: string, key: string): Promise<void> => {
    const mem = await memoryStore.load(profile.baseUrl);
    const now = new Date().toISOString();
    await memoryStore.save(
      kind === 'feature'
        ? { ...mem, features: mem.features.filter((f) => f.id !== key), updatedAt: now }
        : {
            ...mem,
            interactions: mem.interactions.filter((_, i) => String(i) !== key),
            updatedAt: now,
          },
    );
  };
  const editMemoryItem = async (kind: string, key: string): Promise<void> => {
    const mem = await memoryStore.load(profile.baseUrl);
    if (kind === 'feature') {
      const f = mem.features.find((x) => x.id === key);
      if (!f) return;
      promptInput('feature title', f.title, (v) => {
        void memoryStore.load(profile.baseUrl).then((m2) =>
          memoryStore
            .save({
              ...m2,
              features: m2.features.map((x) =>
                x.id === key ? { ...x, title: v, updatedAt: new Date().toISOString() } : x,
              ),
              updatedAt: new Date().toISOString(),
            })
            .then(() => line('updated', C.muted)),
        );
      });
    } else {
      const idx = Number(key);
      const it = mem.interactions[idx];
      if (!it) return;
      promptInput('interaction summary', it.summary, (v) => {
        void memoryStore.load(profile.baseUrl).then((m2) =>
          memoryStore
            .save({
              ...m2,
              interactions: m2.interactions.map((x, i) => (i === idx ? { ...x, summary: v } : x)),
              updatedAt: new Date().toISOString(),
            })
            .then(() => line('updated', C.muted)),
        );
      });
    }
  };
  const memoryItemMenu = (kind: string, key: string): void => {
    openMenu(
      `memory · ${kind}`,
      [
        {
          name: 'Edit',
          description: kind === 'feature' ? 'change the title' : 'change the summary',
          value: 'edit',
        },
        { name: 'Delete', value: 'delete' },
        { name: 'Back', value: 'back' },
      ],
      (v) => {
        if (v === 'edit') void editMemoryItem(kind, key);
        else if (v === 'delete')
          void deleteMemoryItem(kind, key).then(() => {
            line('deleted', C.muted);
            void memoryMenu();
          });
        else void memoryMenu();
      },
    );
  };
  const memoryMenu = async (): Promise<void> => {
    const mem = await memoryStore.load(profile.baseUrl);
    const items: MenuItem[] = [];
    mem.features.forEach((f) =>
      items.push({
        name: `★ ${f.title}`,
        description: [f.path, f.description].filter(Boolean).join(' — '),
        value: 'f:' + f.id,
      }),
    );
    mem.interactions.forEach((it, i) =>
      items.push({
        name: `· ${it.summary}`,
        description: new Date(it.at).toLocaleString(),
        value: 'i:' + i,
      }),
    );
    if (items.length === 0) {
      line('no memory recorded for this app yet', C.muted);
      return;
    }
    items.push({
      name: 'Clear all memory',
      description: 'forget everything for this app',
      value: 'clear',
    });
    openMenu('memory — pick an item', items, (v) => {
      if (v === 'clear') void clearMemory().then(() => line('memory cleared', C.muted));
      else if (v.startsWith('f:')) memoryItemMenu('feature', v.slice(2));
      else if (v.startsWith('i:')) memoryItemMenu('interaction', v.slice(2));
    });
  };

  // -- settings menu --
  const personaMenu = (id: string): void => {
    openMenu(
      `persona · ${id}`,
      [
        { name: 'Edit', description: 'label + color', value: 'edit' },
        { name: 'Delete', value: 'delete' },
        { name: 'Back', value: 'back' },
      ],
      (v) => {
        const p = profile.personas.find((x) => x.id === id);
        if (v === 'edit' && p)
          promptInput(`label + color for ${id}`, `${p.label} ${p.color}`, (s) => {
            const [label, color] = s.split(/\s+/);
            if (!label || !color) {
              line('need: label color', C.err);
              return;
            }
            void persist({
              ...profile,
              personas: profile.personas.map((x) => (x.id === id ? { id, label, color } : x)),
            });
          });
        else if (v === 'delete') {
          const rest = profile.personas.filter((x) => x.id !== id);
          if (rest.length === 0) line('cannot remove the last persona', C.err);
          else void persist({ ...profile, personas: rest });
        } else settingsMenu();
      },
    );
  };
  const settingsMenu = (): void => {
    const items: MenuItem[] = [
      { name: 'Base URL', description: profile.baseUrl, value: 'url' },
      { name: 'Add persona', description: 'id label color', value: 'addp' },
    ];
    profile.personas.forEach((p) =>
      items.push({
        name: `Persona · ${p.id}`,
        description: `${p.label} · ${p.color}`,
        value: 'p:' + p.id,
      }),
    );
    items.push({
      name: 'Token',
      description: 'set / clear the encrypted Claude token',
      value: 'token',
    });
    openMenu('settings', items, (v) => {
      if (v === 'url')
        promptInput('base URL', profile.baseUrl, (u) => void persist({ ...profile, baseUrl: u }));
      else if (v === 'addp')
        promptInput('new persona: id label color', '', (s) => {
          const [id, label, color] = s.split(/\s+/);
          if (!id || !label || !color) {
            line('need: id label color', C.err);
            return;
          }
          const others = profile.personas.filter((p) => p.id !== id);
          void persist({ ...profile, personas: [...others, { id, label, color }] });
        });
      else if (v === 'token')
        promptInput('token (blank cancels · "clear" removes)', '', (t) => void handleToken(t));
      else if (v.startsWith('p:')) personaMenu(v.slice(2));
    });
  };

  // ---- command dispatch ---------------------------------------------------
  // Put a command (with a trailing space) in the input, ready for its argument.
  const prefill = (text: string): void => {
    input.value = text;
    renderSuggest();
    input.focus();
  };

  // Shared by Enter and the Send button.
  const submit = (rawValue: string): void => {
    const value = rawValue.trim();
    input.value = '';
    renderSuggest();
    if (promptMode) {
      const cb = promptMode.onValue;
      promptMode = null;
      if (value === '') line('cancelled', C.muted);
      else cb(value);
      return;
    }
    if (value === '') return;
    log.debug('submit', value.startsWith('/') ? value : '<message>');
    const parts = value.split(/\s+/);
    const cmd = parts[0] ?? '';
    const arg = value.slice(cmd.length).trim();
    switch (cmd) {
      case '/help':
        for (const l of HELP) line(l, C.muted);
        return;
      case '/quit':
        void endSession().finally(() => renderer.destroy());
        return;
      case '/stop':
        stop();
        return;
      case '/end':
        void endSession().then(() => line('— session ended —', C.muted));
        return;
      case '/plan':
        if (arg === '') line('usage: /plan <description>', C.err);
        else void planAndRunDesc(arg);
        return;
      case '/run':
        if (arg === '') line('usage: /run <path-to-script.json>', C.err);
        else void runScriptFile(arg);
        return;
      case '/sessions':
        void sessionsMenu();
        return;
      case '/view':
        if (parts[1] === undefined) line('usage: /view <id>', C.err);
        else void viewSession(parts[1]);
        return;
      case '/resume':
        if (parts[1] === undefined) line('usage: /resume <id>', C.err);
        else void resumeSession(parts[1]);
        return;
      case '/memory':
        void memoryMenu();
        return;
      case '/box':
        void toggleBox();
        return;
      case '/token':
        void handleToken(arg);
        return;
      case '/config':
        if (arg === '') settingsMenu();
        else void handleConfig(parts.slice(1));
        return;
      default:
        if (value.startsWith('/')) line(`unknown command ${cmd} — /help`, C.err);
        else void startOrSend(value);
    }
  };
  input.on(InputRenderableEvents.ENTER, (raw: string) => submit(raw));

  renderer.once('destroy', () => void endSession());
  process.on('SIGINT', () => void endSession().finally(() => process.exit(0)));

  log.info('tui:start', { profile: profile.source ?? 'defaults', baseUrl: profile.baseUrl });
  line('ayd ready. type an instruction and press Enter, or /help for commands.', C.muted);
  line(
    profile.source !== undefined
      ? `profile: ${profile.source}`
      : 'no profile file — using defaults (set AYD_PROFILE or ~/.config/ayd/profile.json, or /config set …)',
    C.muted,
  );
  line(`log: ${logPath()}`, C.muted);
  // Prerequisite check, shown up front.
  void runPreflight().then((pf) => {
    log.info('preflight', pf);
    line(
      `checks · browser: ${pf.browser.ok ? pf.browser.name : 'NONE — install Chrome'} · claude code: ${pf.claudeCode.ok ? (pf.claudeCode.version ?? 'ok') : 'NOT FOUND — run claude login'}`,
      pf.browser.ok && pf.claudeCode.ok ? C.ok : C.err,
    );
  });
};

void main();
