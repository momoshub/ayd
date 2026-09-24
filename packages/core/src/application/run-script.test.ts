import { describe, expect, it } from 'vitest';
import type { DemoScript } from '../domain/demo-script.js';
import {
  createFakeDriver,
  createImmediateClock,
  createRecordingPresenter,
} from '../testing/fakes.js';
import { runScript } from './run-script.js';

const personas = [
  { id: 'admin', label: 'ADMIN', color: '#ef4444' },
  { id: 'user', label: 'USER', color: '#22c55e' },
];

const script = (steps: DemoScript['steps']): DemoScript => ({
  id: 's',
  title: 'S',
  personas,
  steps,
});

describe('runScript', () => {
  it('brackets the run with run-started and run-finished', async () => {
    const driver = createFakeDriver();
    const rec = createRecordingPresenter();
    const clock = createImmediateClock();
    const report = await runScript(script([{ action: 'caption', text: 'hi' }]), {
      driver: driver.driver,
      presenter: rec.presenter,
      clock,
    });

    expect(rec.events[0]).toEqual({ type: 'run-started', scriptId: 's', totalSteps: 1 });
    expect(rec.events.at(-1)).toEqual({ type: 'run-finished', report });
    expect(report).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
  });

  it('dispatches navigate to bringToFront then navigate on the right persona', async () => {
    const driver = createFakeDriver();
    const rec = createRecordingPresenter();
    await runScript(script([{ action: 'navigate', personaId: 'user', path: '/cases' }]), {
      driver: driver.driver,
      presenter: rec.presenter,
      clock: createImmediateClock(),
    });

    expect(driver.calls).toEqual([
      { method: 'bringToFront', personaId: 'user' },
      { method: 'navigate', personaId: 'user', detail: '/cases' },
    ]);
  });

  it('passes an expect step when the target is visible', async () => {
    const driver = createFakeDriver();
    const target = { kind: 'text', text: 'CUPC' } as const;
    driver.setVisible(target, true);
    const report = await runScript(
      script([{ action: 'expect', personaId: 'user', target, toBe: 'visible' }]),
      {
        driver: driver.driver,
        presenter: createRecordingPresenter().presenter,
        clock: createImmediateClock(),
      },
    );
    expect(report.succeeded).toBe(1);
  });

  it('fails an expect step (with a reason) when the visibility mismatches', async () => {
    const driver = createFakeDriver();
    const target = { kind: 'text', text: 'CUPC' } as const;
    driver.setVisible(target, false); // but we expect visible
    const rec = createRecordingPresenter();
    const report = await runScript(
      script([{ action: 'expect', personaId: 'user', target, toBe: 'visible', label: 'granted' }]),
      {
        driver: driver.driver,
        presenter: rec.presenter,
        clock: createImmediateClock(),
      },
    );
    expect(report.failed).toBe(1);
    const failed = rec.events.find((e) => e.type === 'step-failed');
    expect(failed).toBeDefined();
    if (failed?.type === 'step-failed') expect(failed.reason).toContain('expected visible');
  });

  it('records a thrown step as failed and keeps running', async () => {
    const driver = createFakeDriver();
    driver.failOn('click', 'boom');
    const rec = createRecordingPresenter();
    const report = await runScript(
      script([
        { action: 'click', personaId: 'admin', target: { kind: 'css', css: '#a' } },
        { action: 'caption', text: 'still going' },
      ]),
      { driver: driver.driver, presenter: rec.presenter, clock: createImmediateClock() },
    );

    expect(report).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(report.steps[0]).toMatchObject({ index: 0, action: 'click', ok: false, reason: 'boom' });
    expect(report.steps[1]).toMatchObject({ index: 1, action: 'caption', ok: true });
  });

  it('paces between steps when paceMs is set', async () => {
    const driver = createFakeDriver();
    const clock = createImmediateClock();
    await runScript(
      script([
        { action: 'caption', text: 'a' },
        { action: 'caption', text: 'b' },
      ]),
      {
        driver: driver.driver,
        presenter: createRecordingPresenter().presenter,
        clock,
        paceMs: 250,
      },
    );
    expect(clock.sleeps).toEqual([250, 250]);
  });
});
