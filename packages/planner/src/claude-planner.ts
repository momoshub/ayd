import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { type AiPlanner, type DemoScript, type PlannerError, type Result, err } from '@ayd/core';
import { extractDemoScript } from './parse-plan.js';
import { buildPlannerPrompt } from './prompt.js';

/**
 * Claude Code's built-in tools, removed from the model's context so the planner
 * can only think and write JSON — never touch the filesystem, shell, or network.
 * (Browser tools for live exploration are added deliberately in a later phase.)
 */
export const DISALLOWED_TOOLS = [
  'Bash',
  'BashOutput',
  'KillShell',
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoWrite',
] as const;

/** The slice of an SDK message the planner reads; `query` satisfies this structurally. */
interface PlannerMessage {
  readonly type: string;
  readonly subtype?: string;
  readonly is_error?: boolean;
  readonly result?: string;
}

export type QueryFn = (params: {
  prompt: string;
  options?: Options;
}) => AsyncIterable<PlannerMessage>;

export interface ClaudeAgentPlannerOptions {
  /** Override the model; omit to use the user's Claude Code configuration. */
  readonly model?: string;
  /** Injected for tests; defaults to the real Claude Agent SDK `query`. */
  readonly runQuery?: QueryFn;
}

/**
 * AiPlanner backed by the Claude Agent SDK on the user's Claude Code login. Runs
 * a single tool-free turn that returns a DemoScript as JSON, then validates it.
 */
export const createClaudeAgentPlanner = (opts: ClaudeAgentPlannerOptions = {}): AiPlanner => {
  const runQuery: QueryFn = opts.runQuery ?? query;
  return {
    async plan(request): Promise<Result<DemoScript, PlannerError>> {
      const { system, user } = buildPlannerPrompt(request);
      const options: Options = {
        systemPrompt: system,
        disallowedTools: [...DISALLOWED_TOOLS],
        permissionMode: 'default',
        ...(opts.model !== undefined ? { model: opts.model } : {}),
      };

      let finalText: string | null = null;
      let failure: PlannerError | null = null;
      try {
        for await (const message of runQuery({ prompt: user, options })) {
          if (message.type !== 'result') continue;
          if (
            message.subtype === 'success' &&
            message.is_error !== true &&
            typeof message.result === 'string'
          ) {
            finalText = message.result;
          } else {
            failure = { message: `planner turn did not succeed (${message.subtype ?? 'unknown'})` };
          }
        }
      } catch (e) {
        return err({ message: e instanceof Error ? e.message : String(e) });
      }

      if (finalText === null) return err(failure ?? { message: 'planner returned no result' });
      return extractDemoScript(finalText, request);
    },
  };
};
