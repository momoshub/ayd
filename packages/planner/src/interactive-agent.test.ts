import type { AgentMessage, BrowserDriver, Persona } from '@ayd/core';
import { describe, expect, it, vi } from 'vitest';
import { createInteractiveAgent, type InteractiveQueryFn } from './interactive-agent.js';

const personas: Persona[] = [
  { id: 'admin', label: 'ADMIN', color: '#ef4444' },
  { id: 'user', label: 'USER', color: '#22c55e' },
];

const stubDriver: BrowserDriver = {
  bringToFront: async () => undefined,
  navigate: async () => undefined,
  click: async () => undefined,
  type: async () => undefined,
  highlight: async () => undefined,
  waitFor: async () => true,
  isVisible: async () => true,
  caption: async () => undefined,
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
    expect(events.some((e) => e.kind === 'status' && /interrupted/.test(e.text))).toBe(true);
  });
});
