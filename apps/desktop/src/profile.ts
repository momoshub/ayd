import { type Persona, type Result, err, ok } from '@ayd/core';

/**
 * A demo profile is machine-local and SENSITIVE (it names the target app and the
 * personas/accounts to drive). It is edited in the app's Settings and persisted
 * to the OS user-data dir, never bundled or committed. This validates it.
 */
export interface DemoProfile {
  readonly baseUrl: string;
  readonly personas: readonly Persona[];
}

/**
 * What a fresh install runs with so the GUI is usable before anyone opens
 * Settings. Deliberately generic (localhost + two neutral personas) so it names
 * no real environment or account.
 */
export const DEFAULT_PROFILE: DemoProfile = {
  baseUrl: 'http://localhost:3000',
  personas: [
    { id: 'admin', label: 'ADMIN', color: '#ef4444' },
    { id: 'user', label: 'USER', color: '#22c55e' },
  ],
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export const parseProfile = (input: unknown): Result<DemoProfile, string[]> => {
  const issues: string[] = [];
  if (!isRecord(input)) return err(['profile must be an object']);
  if (!isNonEmpty(input['baseUrl'])) issues.push('baseUrl is required');

  const rawPersonas = input['personas'];
  const personas: Persona[] = [];
  if (!Array.isArray(rawPersonas) || rawPersonas.length === 0) {
    issues.push('at least one persona is required');
  } else {
    rawPersonas.forEach((p, i) => {
      if (
        !isRecord(p) ||
        !isNonEmpty(p['id']) ||
        !isNonEmpty(p['label']) ||
        !isNonEmpty(p['color'])
      ) {
        issues.push(`personas[${i}] needs id, label, color`);
        return;
      }
      personas.push({ id: p['id'], label: p['label'], color: p['color'] });
    });
  }

  if (issues.length > 0) return err(issues);
  return ok({ baseUrl: input['baseUrl'] as string, personas });
};
