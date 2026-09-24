// Domain
export type { Result } from './domain/result.js';
export { ok, err, isOk, isErr } from './domain/result.js';
export type { Persona } from './domain/persona.js';
export type { Selector, SelectorKind } from './domain/selector.js';
export { describeSelector } from './domain/selector.js';
export type { Step, StepAction, PersonaStep } from './domain/step.js';
export { stepHasPersona } from './domain/step.js';
export type { DemoScript, DemoScriptIssue } from './domain/demo-script.js';
export { parseDemoScript } from './domain/demo-script.js';
export type { RunReport, StepOutcome } from './domain/run-report.js';

// Ports
export type { BrowserDriver } from './ports/browser-driver.js';
export type { Clock } from './ports/clock.js';
export type { Presenter, RunEvent } from './ports/presenter.js';

// Application
export { runScript, type RunDeps } from './application/run-script.js';
