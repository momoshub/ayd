import type { StepAction } from './step.js';

/** The outcome of one executed step. */
export interface StepOutcome {
  readonly index: number;
  readonly action: StepAction;
  readonly ok: boolean;
  readonly reason?: string;
}

/** The tally after a whole script runs. */
export interface RunReport {
  readonly scriptId: string;
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly steps: readonly StepOutcome[];
}
