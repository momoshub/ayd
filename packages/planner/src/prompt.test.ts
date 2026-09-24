import type { PlanRequest } from '@ayd/core';
import { describe, expect, it } from 'vitest';
import { buildPlannerPrompt, PLANNER_ACTIONS } from './prompt.js';

const base: PlanRequest = {
  description: 'admin grants a template, the scoped user sees it appear',
  personas: [
    { id: 'admin', label: 'ADMIN', color: '#ef4444' },
    { id: 'user', label: 'USER', color: '#22c55e' },
  ],
};

describe('buildPlannerPrompt', () => {
  it('states the DemoScript schema and every action', () => {
    const { system } = buildPlannerPrompt(base);
    expect(system).toContain('DemoScript');
    for (const action of PLANNER_ACTIONS) expect(system).toContain(action);
  });

  it('carries the description and persona ids into the user prompt', () => {
    const { user } = buildPlannerPrompt(base);
    expect(user).toContain('admin grants a template');
    expect(user).toContain('admin');
    expect(user).toContain('user');
  });

  it('includes baseUrl and hints only when provided', () => {
    expect(buildPlannerPrompt(base).user).not.toContain('base URL');
    const withExtras = buildPlannerPrompt({
      ...base,
      baseUrl: 'http://localhost:3000',
      hints: 'save button is red',
    });
    expect(withExtras.user).toContain('http://localhost:3000');
    expect(withExtras.user).toContain('save button is red');
  });
});
