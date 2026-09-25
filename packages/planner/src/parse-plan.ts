import {
  type DemoScript,
  type PlanRequest,
  type PlannerError,
  type Result,
  err,
  parseDemoScript,
} from '@ayd/core';

/** Pull JSON out of a possibly-fenced model response. */
const stripFences = (text: string): string => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'planned-demo';

/** Fill in fields the model reasonably omits (personas, id) so validation focuses on steps. */
const withDefaults = (raw: unknown, request: PlanRequest): unknown => {
  if (!isRecord(raw)) return raw;
  const title =
    typeof raw['title'] === 'string' && raw['title'].trim() !== '' ? raw['title'] : 'Planned demo';
  const hasPersonas = Array.isArray(raw['personas']) && raw['personas'].length > 0;
  return {
    ...raw,
    id: typeof raw['id'] === 'string' && raw['id'].trim() !== '' ? raw['id'] : slug(title),
    title,
    personas: hasPersonas ? raw['personas'] : request.personas,
  };
};

/**
 * Turn a model response into a validated DemoScript. Always runs through
 * parseDemoScript, so a caller gets either a valid script or structured errors —
 * never an unchecked object.
 */
export const extractDemoScript = (
  modelText: string,
  request: PlanRequest,
): Result<DemoScript, PlannerError> => {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(modelText));
  } catch {
    return err({ message: 'planner did not return valid JSON' });
  }
  const parsed = parseDemoScript(withDefaults(raw, request));
  if (parsed.ok) return parsed;
  return err({
    message: 'planner produced an invalid DemoScript',
    issues: parsed.error.map((i) => `${i.path}: ${i.message}`),
  });
};
