import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { AppMemory, FeatureInput } from '@ayd/core';
import { summarizeMemory } from '@ayd/core';
import { z } from 'zod';

/**
 * A mutable, persisted handle on the app's memory that the agent reads and writes
 * during a session. The desktop builds this over the MemoryStore port so writes are
 * saved to disk; tests use an in-memory fake.
 */
export interface AgentMemory {
  current(): AppMemory;
  remember(input: FeatureInput): Promise<void>;
  note(summary: string, personaId?: string): Promise<void>;
}

/** Memory tool names (without the mcp__mem__ prefix). */
export const MEMORY_TOOL_NAMES = ['recallMemory', 'recordFeature', 'recordInteraction'] as const;

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

/**
 * In-process MCP server giving the agent read/write access to the feature-map/memory
 * so knowledge about the app compounds across sessions.
 */
export const createMemoryMcpServer = (memory: AgentMemory) =>
  createSdkMcpServer({
    name: 'mem',
    version: '0.0.0',
    tools: [
      tool(
        'recallMemory',
        'Recall what is already known about this app: its feature map and recent interactions',
        {},
        async () => text(summarizeMemory(memory.current())),
      ),
      tool(
        'recordFeature',
        'Record a feature you found (a page, workflow, or control) so it is remembered next time',
        {
          title: z.string(),
          description: z.string().optional(),
          path: z.string().optional(),
          selectors: z.array(z.string()).optional(),
          tags: z.array(z.string()).optional(),
        },
        async (a) => {
          const input: FeatureInput = {
            title: a.title,
            ...(a.description !== undefined ? { description: a.description } : {}),
            ...(a.path !== undefined ? { path: a.path } : {}),
            ...(a.selectors !== undefined ? { selectors: a.selectors } : {}),
            ...(a.tags !== undefined ? { tags: a.tags } : {}),
          };
          await memory.remember(input);
          return text(`remembered: ${a.title}`);
        },
      ),
      tool(
        'recordInteraction',
        'Note a short summary of what just happened, for the interaction history',
        { summary: z.string(), personaId: z.string().optional() },
        async (a) => {
          await memory.note(a.summary, a.personaId);
          return text('noted');
        },
      ),
    ],
  });
