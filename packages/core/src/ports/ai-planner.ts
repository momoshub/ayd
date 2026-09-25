import type { DemoScript } from '../domain/demo-script.js';
import type { Persona } from '../domain/persona.js';
import type { Result } from '../domain/result.js';

/** What the AI planner is asked to turn into a runnable demo. */
export interface PlanRequest {
  /** Plain-English description of the demo to produce. */
  readonly description: string;
  /** The personas the demo may drive (ids/labels/colours). */
  readonly personas: readonly Persona[];
  /** The target app's base URL, for context in the prompt. */
  readonly baseUrl?: string;
  /** Optional extra guidance (known selectors, gotchas). */
  readonly hints?: string;
}

export interface PlannerError {
  readonly message: string;
  readonly issues?: readonly string[];
}

/**
 * Turns a plain-English description into a validated DemoScript ("compile"). The
 * implementation (packages/planner) uses the Claude Agent SDK on the user's
 * Claude Code login; the result is always run through parseDemoScript, so a
 * caller receives either a valid script or structured errors.
 */
export interface AiPlanner {
  plan(request: PlanRequest): Promise<Result<DemoScript, PlannerError>>;
}
