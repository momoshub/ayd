import type { AgentMessage, ConversationLog, RunEvent } from '@ayd/core';
import type { TabUpdate } from '../preload.mjs';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

interface UiPersona {
  id: string;
  label: string;
  color: string;
}
interface UiProfile {
  baseUrl: string;
  personas: UiPersona[];
}

/** Used only when a saved profile is missing or unreadable, so Settings is never blank. */
const FALLBACK: UiProfile = {
  baseUrl: 'http://localhost:3000',
  personas: [
    { id: 'admin', label: 'ADMIN', color: '#ef4444' },
    { id: 'user', label: 'USER', color: '#22c55e' },
  ],
};

let currentProfile: UiProfile = FALLBACK;

// ---- run log (scripted runs) ----------------------------------------------

const log = (line: string): void => {
  const box = $<HTMLElement>('log');
  const el = document.createElement('div');
  el.className = 'line';
  const glyph = line.trim()[0] ?? '';
  if (glyph === '✓') el.classList.add('ok');
  else if (glyph === '✗' || glyph === '!') el.classList.add('err');
  else if (glyph === '▶' || glyph === '■') el.classList.add('hdr');
  el.textContent = line;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
};

const renderEvent = (e: RunEvent): void => {
  switch (e.type) {
    case 'run-started':
      log(`▶ run started — ${String(e.totalSteps)} steps`);
      break;
    case 'step-started':
      log(`  · [${String(e.index)}] ${e.step.action}`);
      break;
    case 'step-succeeded':
      log(`  ✓ [${String(e.index)}] ${e.step.action}`);
      break;
    case 'step-failed':
      log(`  ✗ [${String(e.index)}] ${e.step.action} — ${e.reason}`);
      break;
    case 'run-finished':
      log(
        `■ done — ${String(e.report.succeeded)}/${String(e.report.total)} ok, ${String(e.report.failed)} failed`,
      );
      break;
  }
};

const reportResult = (label: string, result: unknown): void => {
  if (typeof result === 'object' && result !== null && 'ok' in result && result.ok === false) {
    const error = (result as { error?: readonly string[] }).error ?? ['unknown error'];
    log(`  ✗ ${label} — ${error.join('; ')}`);
  }
};

// ---- header profile + legend ----------------------------------------------

const showProfile = (profile: UiProfile): void => {
  currentProfile = profile;
  $<HTMLElement>('profile').textContent = `profile: ${profile.baseUrl}`;
  const legend = $<HTMLElement>('legend');
  legend.replaceChildren();
  for (const p of profile.personas) {
    const wrap = document.createElement('span');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = p.color;
    wrap.append(swatch, p.label || p.id);
    legend.appendChild(wrap);
  }
};

// ---- live chat transcript --------------------------------------------------

const transcript = (): HTMLElement => $<HTMLElement>('transcript');

const bubble = (kind: 'you' | 'agent' | 'err', text: string): void => {
  const el = document.createElement('div');
  el.className = `msg ${kind}`;
  el.textContent = text;
  const box = transcript();
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
};

const actionChip = (tool: string, detail?: string): void => {
  const el = document.createElement('div');
  el.className = 'action';
  const t = document.createElement('span');
  t.className = 'tool';
  t.textContent = tool;
  el.append('› ', t);
  if (detail !== undefined) el.append(` ${detail}`);
  const box = transcript();
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
};

const statusLine = (text: string, divider = false): void => {
  const el = document.createElement('div');
  el.className = divider ? 'status divider' : 'status';
  el.textContent = text;
  const box = transcript();
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
};

let inPageVisible = true;

const setSession = (active: boolean): void => {
  $<HTMLButtonElement>('continue').disabled = !active;
  $<HTMLButtonElement>('interrupt').disabled = !active;
  $<HTMLButtonElement>('end').disabled = !active;
  $<HTMLButtonElement>('inpage').disabled = !active;
  $<HTMLElement>('profile').classList.toggle('live', active);
  $<HTMLElement>('chat-hint').textContent = active
    ? 'live — the agent is driving the browser'
    : 'idle — send a message to open the browser';
  if (!active) $<HTMLElement>('tabs').replaceChildren();
};

const renderAgentMessage = (m: AgentMessage): void => {
  switch (m.kind) {
    case 'assistant':
      bubble('agent', m.text);
      break;
    case 'action':
      actionChip(m.tool, m.detail);
      break;
    case 'error':
      bubble('err', m.text);
      break;
    case 'status':
      if (m.text.startsWith('you: ')) {
        bubble('you', m.text.slice(5));
        break;
      }
      if (m.text === 'session started') setSession(true);
      else if (m.text === 'session ended') setSession(false);
      statusLine(m.text);
      break;
    case 'done':
      statusLine('turn complete — send the next step', true);
      break;
  }
};

// ---- per-tab progress ------------------------------------------------------

const renderTabs = (u: TabUpdate): void => {
  const box = $<HTMLElement>('tabs');
  box.replaceChildren();
  const colorOf = (personaId: string): string =>
    currentProfile.personas.find((p) => p.id === personaId)?.color ?? 'var(--faint)';
  for (const tab of u.tabs) {
    const row = document.createElement('div');
    row.className = u.busy ? 'tab-row busy' : 'tab-row';
    row.style.borderLeftColor = colorOf(tab.personaId);

    const head = document.createElement('div');
    head.className = 'tab-head';
    const dot = document.createElement('span');
    dot.className = 'tab-dot';
    head.append(dot, `${tab.label || tab.personaId} — ${u.busy ? 'working' : 'idle'}`);

    const url = document.createElement('div');
    url.className = 'tab-url';
    url.textContent = tab.title ? `${tab.title} · ${tab.url}` : tab.url || 'about:blank';

    row.append(head, url);
    const act = u.activity[tab.personaId];
    if (act !== undefined) {
      const actEl = document.createElement('div');
      actEl.className = 'tab-act';
      actEl.textContent = `› ${act}`;
      row.append(actEl);
    }
    box.appendChild(row);
  }
};

// ---- settings modal --------------------------------------------------------

const addPersonaRow = (p?: UiPersona): void => {
  const row = document.createElement('div');
  row.className = 'persona-row';

  const id = document.createElement('input');
  id.type = 'text';
  id.className = 'p-id';
  id.placeholder = 'id (e.g. admin)';
  id.value = p?.id ?? '';

  const label = document.createElement('input');
  label.type = 'text';
  label.className = 'p-label';
  label.placeholder = 'label (e.g. ADMIN)';
  label.value = p?.label ?? '';

  const color = document.createElement('input');
  color.type = 'color';
  color.className = 'p-color';
  color.value = p?.color ?? '#6d6cf5';

  const remove = document.createElement('button');
  remove.className = 'btn-remove';
  remove.textContent = '✕';
  remove.title = 'Remove persona';
  remove.addEventListener('click', () => row.remove());

  row.append(id, label, color, remove);
  $<HTMLElement>('cfg-personas').appendChild(row);
};

const openSettings = (profile: UiProfile): void => {
  $<HTMLInputElement>('cfg-baseurl').value = profile.baseUrl;
  $<HTMLElement>('cfg-personas').replaceChildren();
  const personas = profile.personas.length > 0 ? profile.personas : FALLBACK.personas;
  for (const p of personas) addPersonaRow(p);
  $<HTMLInputElement>('cfg-token').value = '';
  $<HTMLElement>('cfg-error').hidden = true;
  $<HTMLElement>('cfg-status').textContent = '';
  void window.ayd.getAuthStatus().then((s) => {
    $<HTMLElement>('cfg-token-note').textContent = s.tokenSet
      ? 'a token is saved. type a new one to replace it, or leave blank to keep it.'
      : 'no token saved — the AI falls back to your `claude login`. paste one to store it here (encrypted).';
  });
  $<HTMLElement>('settings').hidden = false;
  $<HTMLInputElement>('cfg-baseurl').focus();
};

const closeSettings = (): void => {
  $<HTMLElement>('settings').hidden = true;
};

const collectSettings = (): UiProfile => {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('#cfg-personas .persona-row'));
  const personas = rows.map((row) => ({
    id: row.querySelector<HTMLInputElement>('.p-id')?.value.trim() ?? '',
    label: row.querySelector<HTMLInputElement>('.p-label')?.value.trim() ?? '',
    color: row.querySelector<HTMLInputElement>('.p-color')?.value ?? '#000000',
  }));
  return { baseUrl: $<HTMLInputElement>('cfg-baseurl').value.trim(), personas };
};

const saveSettings = async (): Promise<void> => {
  const profile = collectSettings();
  const errBox = $<HTMLElement>('cfg-error');
  const result = (await window.ayd.saveProfile(profile)) as {
    ok: boolean;
    value?: UiProfile;
    error?: string[];
  };
  if (!result.ok || !result.value) {
    errBox.textContent = (result.error ?? ['could not save settings']).join('\n');
    errBox.hidden = false;
    return;
  }
  // A non-empty token field replaces the stored token; blank leaves it untouched.
  const token = $<HTMLInputElement>('cfg-token').value.trim();
  if (token !== '') await window.ayd.saveToken(token).catch(() => undefined);
  errBox.hidden = true;
  showProfile(result.value);
  currentProfile = result.value;
  $<HTMLElement>('cfg-status').textContent = 'saved';
  setTimeout(closeSettings, 500);
};

// ---- memory modal ----------------------------------------------------------

const loadMemory = async (): Promise<void> => {
  const mem = await window.ayd.getMemory();
  const feats = $<HTMLElement>('mem-features');
  feats.replaceChildren();
  if (mem.features.length === 0) {
    const e = document.createElement('div');
    e.className = 'mem-empty';
    e.textContent = 'Nothing learned yet. Ask the agent to investigate the app.';
    feats.append(e);
  }
  for (const f of [...mem.features].sort((a, b) => b.seenCount - a.seenCount)) {
    const item = document.createElement('div');
    item.className = 'mem-item';
    const title = document.createElement('div');
    title.className = 'mem-title';
    title.textContent = f.title;
    item.append(title);
    if (f.path !== undefined || f.description !== undefined) {
      const sub = document.createElement('div');
      sub.className = 'mem-sub';
      if (f.path !== undefined) {
        const p = document.createElement('span');
        p.className = 'mem-path';
        p.textContent = f.path;
        sub.append(p, ' ');
      }
      if (f.description !== undefined) sub.append(f.description);
      item.append(sub);
    }
    feats.append(item);
  }

  const inter = $<HTMLElement>('mem-interactions');
  inter.replaceChildren();
  if (mem.interactions.length === 0) {
    const e = document.createElement('div');
    e.className = 'mem-empty';
    e.textContent = 'No interactions recorded yet.';
    inter.append(e);
  }
  for (const i of [...mem.interactions].reverse()) {
    const item = document.createElement('div');
    item.className = 'mem-item';
    item.textContent = i.summary;
    inter.append(item);
  }
};

// ---- sessions modal --------------------------------------------------------

const renderSessionTurns = (logEntry: ConversationLog): void => {
  const view = $<HTMLElement>('sessions-view');
  view.replaceChildren();
  view.hidden = false;
  $<HTMLElement>('sessions-list').hidden = true;

  const back = document.createElement('button');
  back.className = 'btn-ghost';
  back.textContent = '← Back';
  back.addEventListener('click', () => {
    view.hidden = true;
    $<HTMLElement>('sessions-list').hidden = false;
  });
  view.append(back);

  for (const turn of logEntry.turns) {
    const m = turn.message;
    const el = document.createElement('div');
    if (m.kind === 'status' && m.text.startsWith('you: ')) {
      el.className = 'msg you';
      el.textContent = m.text.slice(5);
    } else if (m.kind === 'assistant') {
      el.className = 'msg agent';
      el.textContent = m.text;
    } else if (m.kind === 'action') {
      el.className = 'action';
      el.textContent = `› ${m.tool}${m.detail !== undefined ? ` ${m.detail}` : ''}`;
    } else if (m.kind === 'error') {
      el.className = 'msg err';
      el.textContent = m.text;
    } else {
      el.className = 'status';
      el.textContent = m.kind === 'done' ? 'turn complete' : m.text;
    }
    view.append(el);
  }
};

const loadSessions = async (): Promise<void> => {
  $<HTMLElement>('sessions-view').hidden = true;
  const list = $<HTMLElement>('sessions-list');
  list.hidden = false;
  list.replaceChildren();
  const sessions = await window.ayd.listSessions();
  if (sessions.length === 0) {
    const e = document.createElement('div');
    e.className = 'mem-empty';
    e.textContent = 'No saved conversations yet.';
    list.append(e);
    return;
  }
  for (const s of sessions) {
    const item = document.createElement('div');
    item.className = 'mem-item';
    item.style.cursor = 'pointer';
    const title = document.createElement('div');
    title.className = 'mem-title';
    title.textContent = s.title || '(untitled)';
    const sub = document.createElement('div');
    sub.className = 'mem-sub';
    sub.textContent = `${new Date(s.startedAt).toLocaleString()} · ${String(s.turnCount)} messages`;
    item.append(title, sub);
    item.addEventListener('click', () => {
      void window.ayd.getSession(s.id).then((full: ConversationLog | null) => {
        if (full) renderSessionTurns(full);
      });
    });
    list.append(item);
  }
};

// ---- wiring ----------------------------------------------------------------

const sendChat = (text: string): void => {
  const trimmed = text.trim();
  if (trimmed === '') return;
  void window.ayd.chat(trimmed).then((r) => {
    if (typeof r === 'object' && r !== null && 'ok' in r && r.ok === false) {
      const err = (r as { error?: readonly string[] }).error ?? ['unknown error'];
      bubble('err', err.join('; '));
    }
  });
};

const openBackdrop = (id: string): void => {
  $<HTMLElement>(id).hidden = false;
};
const closeBackdrop = (id: string): void => {
  $<HTMLElement>(id).hidden = true;
};

const main = async (): Promise<void> => {
  if (window.ayd === undefined) {
    log('! preload did not load — window.ayd is undefined, so the controls are dead');
    log('  (check the preload path in main.ts: an ESM preload must be named .mjs)');
    return;
  }

  // --- chat controls (the live agent) ---
  const input = $<HTMLTextAreaElement>('chat-input');
  $<HTMLButtonElement>('send').addEventListener('click', () => {
    sendChat(input.value);
    input.value = '';
    input.focus();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat(input.value);
      input.value = '';
    }
  });
  // Stop and Continue are code-driven — no prompt text is sent to the model.
  $<HTMLButtonElement>('interrupt').addEventListener('click', () => {
    void window.ayd.interruptChat().catch((e: unknown) => bubble('err', String(e)));
  });
  $<HTMLButtonElement>('continue').addEventListener('click', () => {
    void window.ayd.resumeChat().catch((e: unknown) => bubble('err', String(e)));
  });
  $<HTMLButtonElement>('end').addEventListener('click', () => {
    void window.ayd.endChat().catch((e: unknown) => bubble('err', String(e)));
    setSession(false);
  });
  $<HTMLButtonElement>('inpage').addEventListener('click', () => {
    inPageVisible = !inPageVisible;
    $<HTMLButtonElement>('inpage').textContent = inPageVisible ? 'Box on page' : 'Box hidden';
    void window.ayd.setInPageChat(inPageVisible).catch(() => undefined);
  });
  window.ayd.onAgentMessage(renderAgentMessage);
  window.ayd.onTabUpdate(renderTabs);

  // --- scripted controls ---
  $<HTMLButtonElement>('run').addEventListener('click', () => {
    log('— run script —');
    void window.ayd
      .runScript($<HTMLTextAreaElement>('script').value)
      .then((r) => reportResult('run script', r))
      .catch((e: unknown) => log(`  ✗ run script — ${String(e)}`));
  });
  $<HTMLButtonElement>('plan').addEventListener('click', () => {
    log('— plan & run —');
    void window.ayd
      .planAndRun($<HTMLTextAreaElement>('description').value)
      .then((r) => reportResult('plan & run', r))
      .catch((e: unknown) => log(`  ✗ plan & run — ${String(e)}`));
  });
  $<HTMLButtonElement>('stop').addEventListener('click', () => {
    log('— stop —');
    void window.ayd.stop().catch((e: unknown) => log(`  ✗ stop — ${String(e)}`));
  });

  window.ayd.onEvent(renderEvent);

  // --- settings ---
  const showSettings = (): void => openSettings(currentProfile);
  $<HTMLButtonElement>('settings-open').addEventListener('click', showSettings);
  $<HTMLElement>('profile').addEventListener('click', showSettings);
  $<HTMLButtonElement>('settings-close').addEventListener('click', closeSettings);
  $<HTMLButtonElement>('cfg-add').addEventListener('click', () => addPersonaRow());
  $<HTMLButtonElement>('cfg-save').addEventListener('click', () => void saveSettings());

  // --- memory ---
  $<HTMLButtonElement>('memory-open').addEventListener('click', () => {
    openBackdrop('memory');
    void loadMemory();
  });
  $<HTMLButtonElement>('memory-refresh').addEventListener('click', () => void loadMemory());
  $<HTMLButtonElement>('memory-close').addEventListener('click', () => closeBackdrop('memory'));

  // --- sessions ---
  $<HTMLButtonElement>('sessions-open').addEventListener('click', () => {
    openBackdrop('sessions');
    void loadSessions();
  });
  $<HTMLButtonElement>('sessions-refresh').addEventListener('click', () => void loadSessions());
  $<HTMLButtonElement>('sessions-close').addEventListener('click', () => closeBackdrop('sessions'));

  // Backdrop click + Escape close whichever modal is open.
  for (const id of ['settings', 'memory', 'sessions']) {
    $<HTMLElement>(id).addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeBackdrop(id);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const id of ['settings', 'memory', 'sessions']) closeBackdrop(id);
  });

  const profile = (await window.ayd.getProfile()) as {
    ok: boolean;
    value?: UiProfile;
    error?: string[];
    configured?: boolean;
  };
  if (profile.ok && profile.value) {
    showProfile(profile.value);
    if (profile.configured === false) openSettings(profile.value);
  } else {
    $<HTMLElement>('profile').textContent = 'settings needed';
    openSettings(FALLBACK);
    $<HTMLElement>('cfg-error').textContent = (profile.error ?? []).join('\n');
    $<HTMLElement>('cfg-error').hidden = (profile.error ?? []).length === 0;
  }

  input.focus();
};

void main().catch((e: unknown) => log(`! control UI failed — ${String(e)}`));
