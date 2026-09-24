import type { DemoScript } from '../domain/demo-script.js';
import type { RunReport, StepOutcome } from '../domain/run-report.js';
import { describeSelector } from '../domain/selector.js';
import type { Step } from '../domain/step.js';
import type { BrowserDriver } from '../ports/browser-driver.js';
import type { Clock } from '../ports/clock.js';
import type { Presenter } from '../ports/presenter.js';

export interface RunDeps {
  readonly driver: BrowserDriver;
  readonly presenter: Presenter;
  readonly clock: Clock;
  /** Pause after each step so the run is watchable. Default 0 (no pause). */
  readonly paceMs?: number;
  /** Fallback timeout for `waitFor` steps that don't set one. */
  readonly defaultTimeoutMs?: number;
}

const executeStep = async (
  step: Step,
  driver: BrowserDriver,
  defaultTimeoutMs: number,
): Promise<void> => {
  switch (step.action) {
    case 'caption':
      return driver.caption(step.text, step.sub);
    case 'switchTo':
      await driver.bringToFront(step.personaId);
      if (step.caption !== undefined) await driver.caption(step.caption);
      return;
    case 'navigate':
      await driver.bringToFront(step.personaId);
      await driver.navigate(step.personaId, step.path);
      if (step.caption !== undefined) await driver.caption(step.caption);
      return;
    case 'click':
      return driver.click(step.personaId, step.target, step.label);
    case 'type':
      return driver.type(step.personaId, step.target, step.text, { submit: step.submit === true });
    case 'highlight':
      return driver.highlight(step.personaId, step.target, step.label);
    case 'waitFor':
      await driver.waitFor(
        step.personaId,
        step.target,
        step.state ?? 'visible',
        step.timeoutMs ?? defaultTimeoutMs,
      );
      return;
    case 'expect': {
      const visible = await driver.isVisible(step.personaId, step.target);
      const satisfied = step.toBe === 'visible' ? visible : !visible;
      if (!satisfied) {
        const suffix = step.label !== undefined ? ` (${step.label})` : '';
        throw new Error(`expected ${step.toBe}: ${describeSelector(step.target)}${suffix}`);
      }
      return;
    }
  }
};

/**
 * Run a validated script end to end. A failing step is recorded and the run
 * continues — a demo should degrade, not halt, on one bad selector.
 */
export const runScript = async (script: DemoScript, deps: RunDeps): Promise<RunReport> => {
  const { driver, presenter, clock } = deps;
  const paceMs = deps.paceMs ?? 0;
  const defaultTimeoutMs = deps.defaultTimeoutMs ?? 5000;

  presenter.emit({ type: 'run-started', scriptId: script.id, totalSteps: script.steps.length });

  const outcomes: StepOutcome[] = [];
  for (const [index, step] of script.steps.entries()) {
    presenter.emit({ type: 'step-started', index, step });
    try {
      await executeStep(step, driver, defaultTimeoutMs);
      outcomes.push({ index, action: step.action, ok: true });
      presenter.emit({ type: 'step-succeeded', index, step });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      outcomes.push({ index, action: step.action, ok: false, reason });
      presenter.emit({ type: 'step-failed', index, step, reason });
    }
    if (paceMs > 0) await clock.sleep(paceMs);
  }

  const succeeded = outcomes.filter((o) => o.ok).length;
  const report: RunReport = {
    scriptId: script.id,
    total: outcomes.length,
    succeeded,
    failed: outcomes.length - succeeded,
    steps: outcomes,
  };
  presenter.emit({ type: 'run-finished', report });
  return report;
};
