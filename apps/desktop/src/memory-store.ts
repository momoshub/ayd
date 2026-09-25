import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type AppMemory, emptyMemory, type MemoryStore, slugify } from '@ayd/core';
import { app } from 'electron';

/**
 * File-backed memory: one JSON file per app (keyed by a slug of its base URL) under
 * the OS user-data dir, so the feature-map/memory persists across runs and stays
 * machine-local. A missing or unreadable file starts fresh.
 */

const fileFor = (baseUrl: string): string =>
  join(app.getPath('userData'), 'memory', `${slugify(baseUrl) || 'app'}.json`);

const isAppMemory = (v: unknown): v is AppMemory =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as AppMemory).features) &&
  Array.isArray((v as AppMemory).interactions);

export const createFileMemoryStore = (): MemoryStore => ({
  async load(baseUrl) {
    try {
      const raw = JSON.parse(await readFile(fileFor(baseUrl), 'utf8')) as unknown;
      if (isAppMemory(raw)) return { ...raw, baseUrl };
    } catch {
      // no memory yet (or unreadable) — start from empty
    }
    return emptyMemory(baseUrl, new Date().toISOString());
  },
  async save(memory) {
    const path = fileFor(memory.baseUrl);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(memory, null, 2), 'utf8');
  },
});
