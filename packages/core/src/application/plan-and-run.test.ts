import { describe, expect, it, vi } from 'vitest';
import type { DemoScript } from '../domain/demo-script.js';
import { err, ok } from '../domain/result.js';
import type { AiPlanner, PlanRequest } from '../ports/ai-planner.js';
import {
  createFakeDriver,
  createImmediateClock,
  createRecordingPresenter,
} from '../testing/fakes.js';
import { planAndRun } from './plan-and-run.js';

const request: PlanRequest = {
  description: 'demo',
  personas: [{ id: 'user', label: 'USER', color: '#22c55e' }],
};

const script: DemoScript = {
  id: 's',
  title: 'S',
  personas: request.personas,
  steps: [{ action: 'navigate', personaId: 'user', path: '/cases' }],
};

const deps = () => ({
  driver: createFakeDriver(),
  presenter: createRecordingPresenter(),
  clock: createImmediateClock(),
});

describe('planAndRun', () => {
  it('runs the planned script and returns script + report', async () => {
    const d = deps();
    const planner: AiPlanner = { plan: vi.fn().mockResolvedValue(ok(script)) };
    const r = await planAndRun(request, {
      planner,
      driver: d.driver.driver,
      presenter: d.presenter.presenter,
      clock: d.clock,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.script.id).toBe('s');
      expect(r.value.report.succeeded).toBe(1);
    }
    expect(d.driver.calls.some((c) => c.method === 'navigate')).toBe(true);
  });

  it('short-circuits on a planning failure without driving the browser', async () => {
    const d = deps();
    const planner: AiPlanner = { plan: vi.fn().mockResolvedValue(err({ message: 'nope' })) };
    const r = await planAndRun(request, {
      planner,
      driver: d.driver.driver,
      presenter: d.presenter.presenter,
      clock: d.clock,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('nope');
    expect(d.driver.calls).toHaveLength(0);
    expect(d.presenter.events).toHaveLength(0);
  });
});
