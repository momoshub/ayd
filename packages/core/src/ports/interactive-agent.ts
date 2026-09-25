import type { Persona } from '../domain/persona.js';

/** Events streamed from a live agent session to the UI. */
export type AgentMessage =
  | { readonly kind: 'assistant'; readonly text: string }
  | { readonly kind: 'action'; readonly tool: string; readonly detail?: string }
  | { readonly kind: 'status'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string }
  | { readonly kind: 'done'; readonly text?: string };

/** A running conversation the operator steers while the agent drives the browser. */
export interface AgentSession {
  /** Push a chat message mid-run (queued if a turn is in flight). */
  send(text: string): void;
  /**
   * Stop the current turn's work now via code (not by prompting the model). The
   * session stays open; call resume() or send() to carry on.
   */
  interrupt(): Promise<void>;
  /** Resume after an interrupt via code — carries on the task without an operator prompt. */
  resume(): void;
  /** End the session and release resources. */
  end(): Promise<void>;
}

export interface StartAgentRequest {
  readonly personas: readonly Persona[];
  readonly baseUrl?: string;
  /** The first instruction that kicks off the session. */
  readonly firstMessage: string;
  /** Sink for streamed events (assistant text, browser actions, status). */
  readonly onMessage: (message: AgentMessage) => void;
}

/**
 * A live agent that drives the browser through tools while the operator chats,
 * interrupts, and continues. Implemented in packages/planner with the Claude
 * Agent SDK (streaming input + interrupt + in-process MCP browser tools).
 */
export interface InteractiveAgent {
  start(request: StartAgentRequest): AgentSession;
}
