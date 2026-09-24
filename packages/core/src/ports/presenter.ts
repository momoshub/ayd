import type { RunReport } from '../domain/run-report.js';
import type { Step } from '../domain/step.js';

/** Progress events the use-case emits as it runs; the UI renders them live. */
export type RunEvent =
  | { readonly type: 'run-started'; readonly scriptId: string; readonly totalSteps: number }
  | { readonly type: 'step-started'; readonly index: number; readonly step: Step }
  | { readonly type: 'step-succeeded'; readonly index: number; readonly step: Step }
  | {
      readonly type: 'step-failed';
      readonly index: number;
      readonly step: Step;
      readonly reason: string;
    }
  | { readonly type: 'run-finished'; readonly report: RunReport };

/** Sink for run events (an Electron IPC bridge in production, a recorder in tests). */
export interface Presenter {
  emit(event: RunEvent): void;
}
