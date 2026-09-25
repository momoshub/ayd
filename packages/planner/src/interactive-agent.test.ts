import type { AgentMessage, AppMemory, BrowserDriver, PageObserver, Persona } from '@ayd/core';
import { emptyMemory } from '@ayd/core';
import { describe, expect, it, vi } from 'vitest';
import type { AgentMemory } from './memory-tools.js';
import { createInteractiveAgent, type InteractiveQueryFn } from './interactive-agent.js';

const personas: Persona[] = [
  { id: 'admin', label: 'ADMIN', color: '#ef4444' },
  { id: 'user', label: 'USER', color: '#22c55e' },
];

const stubDriver: BrowserDriver & PageObserver = {
  bringToFront: async () => undefined,
  navigate: async () => undefined,
  click: async () => undefined,
  type: async () => undefined,
  highlight: async () => undefined,
  waitFor: async () => true,
  isVisible: async () => true,
  caption: async () => undefined,
  observe: async () => ({ url: '', title: '', headings: [], links: [], controls: [] }),
};

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

/** A fake Query: yields the given messages, then stays open; exposes interrupt. */
const fakeQuery = (
  msgs: readonly unknown[],
  interrupt = vi.fn().mockResolvedValue(undefined),
): InteractiveQueryFn => {
  const gen = (async function* () {
    for (const m of msgs) yield m;
    await new Promise(() => undefined); // stay open like a live session
  })();
  return (() => Object.assign(gen, { interrupt })) as unknown as InteractiveQueryFn;
};

describe('createInteractiveAgent', () => {
  it('streams assistant text, browser actions, and done', async () => {
    const events: AgentMessage[] = [];
    const runQuery = fakeQuery([
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Opening the page' }] } },
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'mcp__ayd__navigate',
              input: { personaId: 'admin', path: '/cases' },
            },
          ],
        },
      },
      { type: 'result', subtype: 'success', result: 'all done' },
    ]);
    createInteractiveAgent({ driver: stubDriver, runQuery }).start({
      personas,
      firstMessage: 'go',
      onMessage: (e) => events.push(e),
    });
    await tick();

    expect(events).toContainEqual({ kind: 'status', text: 'session started' });
    expect(events).toContainEqual({ kind: 'assistant', text: 'Opening the page' });
    expect(events).toContainEqual({ kind: 'action', tool: 'navigate', detail: 'admin /cases' });
    expect(events.some((e) => e.kind === 'done')).toBe(true);
  });

  it('send() surfaces the operator message and keeps the session open', () => {
    const events: AgentMessage[] = [];
    const session = createInteractiveAgent({ driver: stubDriver, runQuery: fakeQuery([]) }).start({
      personas,
      firstMessage: 'go',
      onMessage: (e) => events.push(e),
    });
    session.send('highlight the Save button');
    expect(
      events.some((e) => e.kind === 'status' && e.text.includes('highlight the Save button')),
    ).toBe(true);
  });

  it('logs the operator opening ask to memory and strips the mem tool prefix', async () => {
    const note = vi.fn().mockResolvedValue(undefined);
    let mem: AppMemory = emptyMemory('http://x', '2026-01-01T00:00:00.000Z');
    const memory: AgentMemory = {
      current: () => mem,
      remember: async () => {
        mem = { ...mem };
      },
      note,
    };
    const events: AgentMessage[] = [];
    const runQuery = fakeQuery([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'mcp__mem__recordFeature', input: { path: '/x' } }],
        },
      },
    ]);
    createInteractiveAgent({ driver: stubDriver, memory, runQuery }).start({
      personas,
      firstMessage: 'show me the inbox',
      onMessage: (e) => events.push(e),
    });
    await tick();

    expect(note).toHaveBeenCalledWith('operator: show me the inbox');
    expect(events).toContainEqual({ kind: 'action', tool: 'recordFeature', detail: '/x' });
  });

  it('interrupt() calls the SDK interrupt and invites continuation', async () => {
    const interrupt = vi.fn().mockResolvedValue(undefined);
    const events: AgentMessage[] = [];
    const session = createInteractiveAgent({
      driver: stubDriver,
      runQuery: fakeQuery([], interrupt),
    }).start({
      personas,
      firstMessage: 'go',
      onMessage: (e) => events.push(e),
    });
    await session.interrupt();
    expect(interrupt).toHaveBeenCalledOnce();
    expect(events.some((e) => e.kind === 'status' && /stopped/.test(e.text))).toBe(true);
  });

  it('resume() continues via code without echoing an operator prompt', () => {
    const events: AgentMessage[] = [];
    const session = createInteractiveAgent({ driver: stubDriver, runQuery: fakeQuery([]) }).start({
      personas,
      firstMessage: 'go',
      onMessage: (e) => events.push(e),
    });
    session.resume();
    expect(events.some((e) => e.kind === 'status' && /resuming/.test(e.text))).toBe(true);
    // resume must NOT surface a "you:" operator bubble — it is code-driven.
    expect(events.some((e) => e.kind === 'status' && e.text.startsWith('you:'))).toBe(false);
  });
});
