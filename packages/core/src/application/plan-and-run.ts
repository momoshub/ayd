import type { DemoScript } from '../domain/demo-script.js';
import { type Result, err, ok } from '../domain/result.js';
import type { RunReport } from '../domain/run-report.js';
import type { AiPlanner, PlanRequest, PlannerError } from '../ports/ai-planner.js';
import { runScript, type RunDeps } from './run-script.js';

export interface PlanAndRunDeps extends RunDeps {
  readonly planner: AiPlanner;
}

export interface PlanAndRunOutput {
  readonly script: DemoScript;
  readonly report: RunReport;
}

/**
 * Compile a description into a DemoScript (via the AI planner) and then run it —
 * the "plan mode" path. Planning failures short-circuit before anything runs, so
 * a bad plan never drives the browser.
 */
export const planAndRun = async (
  request: PlanRequest,
  deps: PlanAndRunDeps,
): Promise<Result<PlanAndRunOutput, PlannerError>> => {
  const planned = await deps.planner.plan(request);
  if (!planned.ok) return err(planned.error);
  const report = await runScript(planned.value, deps);
  return ok({ script: planned.value, report });
};
