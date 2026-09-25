import type { AgentMessage } from './interactive-agent.js';

/** One entry in a saved conversation: an agent/operator message plus when it happened. */
export interface ConversationTurn {
  readonly at: string;
  readonly message: AgentMessage;
}

/** A full saved conversation transcript for one live session. */
export interface ConversationLog {
  readonly id: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly baseUrl: string;
  /** A short human label, usually the operator's opening ask. */
  readonly title: string;
  readonly turns: readonly ConversationTurn[];
}

/** List-view metadata for a saved conversation, without loading its turns. */
export interface ConversationSummary {
  readonly id: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly baseUrl: string;
  readonly title: string;
  readonly turnCount: number;
}

/**
 * Persistence for saved conversations. Implemented in the desktop app by files in
 * the OS user-data dir; the UI lists past sessions and reopens their transcripts.
 */
export interface ConversationStore {
  list(): Promise<readonly ConversationSummary[]>;
  load(id: string): Promise<ConversationLog | null>;
  save(log: ConversationLog): Promise<void>;
}
