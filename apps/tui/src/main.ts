#!/usr/bin/env bun
import {
  BoxRenderable,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  ScrollBoxRenderable,
  TextRenderable,
} from '@opentui/core';
import type { AgentMessage, AgentSession } from '@ayd/core';
import { createPlaywrightDriver, launchDemoBrowser, type PlaywrightDriver } from '@ayd/engine';
import { createInteractiveAgent } from '@ayd/planner';
import type { Browser } from 'playwright';
import { loadProfile } from './profile.js';

const C = {
  accent: '#8b7cf6',
  you: '#6d6cf5',
  text: '#e8eaf0',
  muted: '#6b7385',
  err: '#f26363',
  ok: '#34d399',
} as const;

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

const main = async (): Promise<void> => {
  const profile = await loadProfile();
  const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 });

  const root = new BoxRenderable(renderer, {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
  });
  renderer.root.add(root);

  const personas = profile.personas.map((p) => p.id).join(', ');
  // flexShrink: 0 so the scrollbox's flexGrow can't squeeze these fixed rows to nothing.
  root.add(
    new TextRenderable(renderer, {
      content: `ayd · ${profile.baseUrl} · personas: ${personas}`,
      fg: C.accent,
      flexShrink: 0,
    }),
  );
  root.add(
    new TextRenderable(renderer, {
      content: 'Enter: send/continue · /stop interrupt · /end close session · /quit (or Ctrl+C)',
      fg: C.muted,
      flexShrink: 0,
    }),
  );

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

  const input = new InputRenderable(renderer, {
    width: '100%',
    flexShrink: 0,
    placeholder: 'tell the agent what to demo…',
  });
  root.add(input);
  input.focus();

  const line = (content: string, fg: string = C.text): void => {
    for (const l of wrap(content, Math.max(20, renderer.width - 2))) {
      transcript.add(new TextRenderable(renderer, { content: l, fg }));
    }
    renderer.requestRender();
  };

  let session: AgentSession | null = null;
  let browser: Browser | null = null;
  let driver: PlaywrightDriver | null = null;
  let starting = false;

  const onMessage = (m: AgentMessage): void => {
    if (m.kind === 'assistant') line(m.text, C.text);
    else if (m.kind === 'action')
      line(`  › ${m.tool}${m.detail !== undefined ? ` ${m.detail}` : ''}`, C.accent);
    else if (m.kind === 'status') {
      if (!m.text.startsWith('you:')) line(m.text, C.muted);
    } else if (m.kind === 'error') line(`✗ ${m.text}`, C.err);
    else line('— turn complete — send the next step', C.muted);
  };

  const startOrSend = async (text: string): Promise<void> => {
    if (session) {
      line(`you: ${text}`, C.you);
      session.send(text);
      return;
    }
    if (starting) return;
    starting = true;
    line(`you: ${text}`, C.you);
    line('opening the browser…', C.muted);
    try {
      const launched = await launchDemoBrowser();
      browser = launched.browser;
      line(`browser: ${launched.info.name}`, C.muted);
      driver = createPlaywrightDriver({
        browser,
        personas: profile.personas,
        baseUrl: profile.baseUrl,
      });
      session = createInteractiveAgent({ driver }).start({
        personas: profile.personas,
        baseUrl: profile.baseUrl,
        firstMessage: text,
        onMessage,
      });
    } catch (e) {
      line(`✗ could not start: ${String(e)}`, C.err);
      session = null;
    } finally {
      starting = false;
    }
  };

  const cleanup = async (): Promise<void> => {
    await session?.end().catch(() => undefined);
    await driver?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    session = null;
    driver = null;
    browser = null;
  };

  input.on(InputRenderableEvents.ENTER, (value: string) => {
    const text = value.trim();
    input.value = '';
    if (text === '') return;
    if (text === '/quit') {
      void cleanup().finally(() => renderer.destroy());
      return;
    }
    if (text === '/stop') {
      if (session) {
        void session.interrupt();
        line('interrupted — send a message to continue', C.muted);
      }
      return;
    }
    if (text === '/end') {
      void cleanup();
      line('— session ended —', C.muted);
      return;
    }
    void startOrSend(text);
  });

  renderer.once('destroy', () => void cleanup());
  process.on('SIGINT', () => void cleanup().finally(() => process.exit(0)));

  line('ayd ready. type an instruction and press Enter to open the browser and start.', C.muted);
  if (profile.source !== undefined) line(`profile: ${profile.source}`, C.muted);
  else
    line(
      'no profile file found — using defaults (set AYD_PROFILE or ~/.config/ayd/profile.json)',
      C.muted,
    );
};

void main();
