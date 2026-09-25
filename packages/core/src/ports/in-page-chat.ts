import type { AgentMessage } from './interactive-agent.js';

/**
 * A chat surface injected into the driven browser page itself — a floating, hidable
 * box the operator can type into without leaving the demo window. Implemented by the
 * Playwright engine (via an injected widget + a two-way binding); the desktop wires
 * operator input to the agent and the agent's messages back into the box.
 */
export interface InPageChat {
  /** Register the handler called when the operator sends a message from the in-page box. */
  onOperatorMessage(cb: (text: string) => void): void;
  /** Stream an agent message into the in-page box. */
  push(message: AgentMessage): Promise<void>;
  setVisible(visible: boolean): Promise<void>;
}
