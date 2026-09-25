import type { AppMemory } from '../domain/memory.js';

/**
 * Persistence for the app's feature-map/memory. Implemented in the desktop app by
 * a file in the OS user-data dir; faked in tests. Keyed by base URL so each target
 * app keeps its own memory.
 */
export interface MemoryStore {
  /** Load memory for an app, returning empty memory if none is stored yet. */
  load(baseUrl: string): Promise<AppMemory>;
  save(memory: AppMemory): Promise<void>;
}
