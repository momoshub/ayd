import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { PlanRequest } from '@ayd/core';
import { describe, expect, it, vi } from 'vitest';
import { createClaudeAgentPlanner, DISALLOWED_TOOLS, type QueryFn } from './claude-planner.js';

const request: PlanRequest = {
  description: 'admin grants, user sees it',
  personas: [{ id: 'user', label: 'USER', color: '#22c55e' }],
};

const scriptJson = JSON.stringify({
  id: 'x',
  title: 'X',
  steps: [{ action: 'navigate', personaId: 'user', path: '/cases' }],
});

/** Fake query: yields one successful result message carrying `result`. */
const okQuery = (result: string): QueryFn =>
  async function* () {
    yield { type: 'assistant' };
    yield { type: 'result', subtype: 'success', is_error: false, result };
  };

describe('createClaudeAgentPlanner', () => {
  it('compiles a successful turn into a validated DemoScript', async () => {
    const planner = createClaudeAgentPlanner({
      runQuery: okQuery('```json\n' + scriptJson + '\n```'),
    });
    const r = await planner.plan(request);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.steps[0]?.action).toBe('navigate');
  });

  it('sends an isolated, tool-free, custom-system-prompt turn', async () => {
    const spy = vi.fn(okQuery(scriptJson));
    await createClaudeAgentPlanner({ runQuery: spy as unknown as QueryFn }).plan(request);
    const options = spy.mock.calls[0]?.[0].options as Options;
    expect(options.disallowedTools).toEqual([...DISALLOWED_TOOLS]);
    expect(typeof options.systemPrompt).toBe('string');
    // isolation: no Claude Code settings/hooks/MCP/CLAUDE.md loaded
    expect(options.settingSources).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
    expect(spy.mock.calls[0]?.[0].prompt).toContain('admin grants');
  });

  it('passes a model override through', async () => {
    const spy = vi.fn(okQuery(scriptJson));
    await createClaudeAgentPlanner({
      runQuery: spy as unknown as QueryFn,
      model: 'claude-sonnet-5',
    }).plan(request);
    expect((spy.mock.calls[0]?.[0].options as Options).model).toBe('claude-sonnet-5');
  });

  it('errors when the turn does not succeed', async () => {
    const failQuery: QueryFn = async function* () {
      yield { type: 'result', subtype: 'error_max_turns', is_error: true };
    };
    const r = await createClaudeAgentPlanner({ runQuery: failQuery }).plan(request);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/did not succeed/);
  });

  it('errors when the model returns no result at all', async () => {
    const emptyQuery: QueryFn = async function* () {
      yield { type: 'assistant' };
    };
    const r = await createClaudeAgentPlanner({ runQuery: emptyQuery }).plan(request);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/no result/);
  });

  it('surfaces validation errors from a bad script', async () => {
    const r = await createClaudeAgentPlanner({ runQuery: okQuery('not json') }).plan(request);
    expect(r.ok).toBe(false);
  });
});
