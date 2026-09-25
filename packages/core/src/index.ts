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
export type { AppMemory, FeatureNote, FeatureInput, InteractionNote } from './domain/memory.js';
export {
  emptyMemory,
  rememberFeature,
  recordInteraction,
  summarizeMemory,
  slugify,
} from './domain/memory.js';

// Ports
export type { BrowserDriver } from './ports/browser-driver.js';
export type { Clock } from './ports/clock.js';
export type { Presenter, RunEvent } from './ports/presenter.js';
export type { AiPlanner, PlanRequest, PlannerError } from './ports/ai-planner.js';
export type {
  InteractiveAgent,
  AgentSession,
  AgentMessage,
  StartAgentRequest,
} from './ports/interactive-agent.js';
export type { MemoryStore } from './ports/memory-store.js';
export type { PageObserver, PageObservation, PageShooter } from './ports/page-observer.js';
export type { InPageChat } from './ports/in-page-chat.js';
export type { TabReporter, TabInfo } from './ports/tab-reporter.js';
export type {
  ConversationStore,
  ConversationLog,
  ConversationSummary,
  ConversationTurn,
} from './ports/conversation-store.js';

// Application
export { runScript, type RunDeps } from './application/run-script.js';
export {
  planAndRun,
  type PlanAndRunDeps,
  type PlanAndRunOutput,
} from './application/plan-and-run.js';
