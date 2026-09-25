import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Persona } from '@ayd/core';

/**
 * The machine-local, SENSITIVE demo config: the target app and the personas to
 * drive. Loaded from a gitignored JSON file, never bundled. No Electron user-data
 * dir here (this is a terminal app), so it reads a plain file path instead.
 */
export interface DemoProfile {
  readonly baseUrl: string;
  readonly personas: readonly Persona[];
  /** Where it was loaded from, for display; undefined when using defaults. */
  readonly source?: string;
}

/** Generic defaults so a fresh install runs before anyone writes a profile. */
export const DEFAULT_PROFILE: DemoProfile = {
  baseUrl: 'http://localhost:3000',
  personas: [
    { id: 'admin', label: 'ADMIN', color: '#ef4444' },
    { id: 'user', label: 'USER', color: '#22c55e' },
  ],
};

// Checked in order; AYD_PROFILE wins, then a per-user config, then a repo-local file.
const candidatePaths = (): readonly string[] => {
  const env = process.env['AYD_PROFILE'];
  return [
    ...(env !== undefined && env !== '' ? [env] : []),
    join(homedir(), '.config', 'ayd', 'profile.json'),
    join(process.cwd(), 'config', 'local', 'profile.json'),
  ];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

const parseProfile = (input: unknown): DemoProfile | null => {
  if (!isRecord(input) || !nonEmpty(input['baseUrl']) || !Array.isArray(input['personas'])) {
    return null;
  }
  const personas: Persona[] = [];
  for (const p of input['personas']) {
    if (isRecord(p) && nonEmpty(p['id']) && nonEmpty(p['label']) && nonEmpty(p['color'])) {
      personas.push({ id: p['id'], label: p['label'], color: p['color'] });
    }
  }
  if (personas.length === 0) return null;
  return { baseUrl: input['baseUrl'], personas };
};

/** Load the first valid profile file found, else the defaults. */
export const loadProfile = async (): Promise<DemoProfile> => {
  for (const path of candidatePaths()) {
    try {
      const parsed = parseProfile(JSON.parse(await readFile(path, 'utf8')));
      if (parsed) return { ...parsed, source: path };
    } catch {
      /* not there or invalid — try the next candidate */
    }
  }
  return DEFAULT_PROFILE;
};
