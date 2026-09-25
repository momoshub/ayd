import { type MemoryStore, recordInteraction, rememberFeature } from '@ayd/core';
import type { AgentMemory } from '@ayd/planner';

/**
 * A mutable, persisted memory handle for one app: applies the pure core update
 * functions and saves after every write, so the feature-map survives a crash.
 */
export const buildAgentMemory = async (
  store: MemoryStore,
  baseUrl: string,
): Promise<AgentMemory> => {
  let mem = await store.load(baseUrl);
  return {
    current: () => mem,
    remember: async (input) => {
      mem = rememberFeature(mem, input, new Date().toISOString());
      await store.save(mem);
    },
    note: async (summary, personaId) => {
      mem = recordInteraction(
        mem,
        personaId !== undefined ? { summary, personaId } : { summary },
        new Date().toISOString(),
      );
      await store.save(mem);
    },
  };
};
