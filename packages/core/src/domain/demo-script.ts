import type { Persona } from './persona.js';
import { type Result, ok, err } from './result.js';
import type { Selector } from './selector.js';
import type { Step } from './step.js';

/** A complete, ordered demo: the personas it drives and the steps to run. */
export interface DemoScript {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly personas: readonly Persona[];
  readonly steps: readonly Step[];
}

export interface DemoScriptIssue {
  readonly path: string;
  readonly message: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNonEmpty = (v: unknown): v is string => isString(v) && v.trim().length > 0;

const SELECTOR_REQUIRED: Record<Selector['kind'], readonly string[]> = {
  role: ['role'],
  text: ['text'],
  testId: ['testId'],
  label: ['label'],
  css: ['css'],
};

const parseSelector = (
  v: unknown,
  path: string,
  issues: DemoScriptIssue[],
): Selector | undefined => {
  if (!isRecord(v)) {
    issues.push({ path, message: 'selector must be an object' });
    return undefined;
  }
  const kind = v['kind'];
  if (!isString(kind) || !(kind in SELECTOR_REQUIRED)) {
    issues.push({ path: `${path}.kind`, message: `unknown selector kind ${JSON.stringify(kind)}` });
    return undefined;
  }
  const before = issues.length;
  for (const field of SELECTOR_REQUIRED[kind as Selector['kind']]) {
    if (!isNonEmpty(v[field]))
      issues.push({ path: `${path}.${field}`, message: `${field} is required` });
  }
  return issues.length === before ? (v as unknown as Selector) : undefined;
};

const parsePersonas = (v: unknown, issues: DemoScriptIssue[]): Persona[] => {
  if (!Array.isArray(v) || v.length === 0) {
    issues.push({ path: 'personas', message: 'at least one persona is required' });
    return [];
  }
  const personas: Persona[] = [];
  const seen = new Set<string>();
  v.forEach((raw, i) => {
    const path = `personas[${i}]`;
    if (!isRecord(raw)) {
      issues.push({ path, message: 'persona must be an object' });
      return;
    }
    for (const field of ['id', 'label', 'color'] as const) {
      if (!isNonEmpty(raw[field]))
        issues.push({ path: `${path}.${field}`, message: `${field} is required` });
    }
    const id = raw['id'];
    if (isNonEmpty(id)) {
      if (seen.has(id))
        issues.push({ path: `${path}.id`, message: `duplicate persona id ${JSON.stringify(id)}` });
      seen.add(id);
    }
    if (isNonEmpty(raw['id']) && isNonEmpty(raw['label']) && isNonEmpty(raw['color'])) {
      personas.push({ id: raw['id'], label: raw['label'], color: raw['color'] });
    }
  });
  return personas;
};

// Per-action required scalar fields (persona/selector are validated separately).
const STEP_SHAPE: Record<
  Step['action'],
  { persona: boolean; selector: boolean; scalars: readonly string[] }
> = {
  caption: { persona: false, selector: false, scalars: ['text'] },
  switchTo: { persona: true, selector: false, scalars: [] },
  navigate: { persona: true, selector: false, scalars: ['path'] },
  click: { persona: true, selector: true, scalars: [] },
  type: { persona: true, selector: true, scalars: ['text'] },
  highlight: { persona: true, selector: true, scalars: [] },
  waitFor: { persona: true, selector: true, scalars: [] },
  expect: { persona: true, selector: true, scalars: ['toBe'] },
};

const parseSteps = (
  v: unknown,
  personaIds: ReadonlySet<string>,
  issues: DemoScriptIssue[],
): Step[] => {
  if (!Array.isArray(v)) {
    issues.push({ path: 'steps', message: 'steps must be an array' });
    return [];
  }
  const steps: Step[] = [];
  v.forEach((raw, i) => {
    const path = `steps[${i}]`;
    if (!isRecord(raw)) {
      issues.push({ path, message: 'step must be an object' });
      return;
    }
    const action = raw['action'];
    if (!isString(action) || !(action in STEP_SHAPE)) {
      issues.push({
        path: `${path}.action`,
        message: `unknown step action ${JSON.stringify(action)}`,
      });
      return;
    }
    const shape = STEP_SHAPE[action as Step['action']];
    const before = issues.length;
    if (shape.persona) {
      const pid = raw['personaId'];
      if (!isNonEmpty(pid))
        issues.push({ path: `${path}.personaId`, message: 'personaId is required' });
      else if (!personaIds.has(pid))
        issues.push({
          path: `${path}.personaId`,
          message: `unknown persona ${JSON.stringify(pid)}`,
        });
    }
    if (shape.selector) parseSelector(raw['target'], `${path}.target`, issues);
    for (const field of shape.scalars) {
      if (!isNonEmpty(raw[field]))
        issues.push({ path: `${path}.${field}`, message: `${field} is required` });
    }
    if (issues.length === before) steps.push(raw as unknown as Step);
  });
  return steps;
};

/**
 * Validate untrusted input (a hand-written or AI-generated script) into a
 * DemoScript. Returns every problem at once so an author fixes them in one pass.
 */
export const parseDemoScript = (input: unknown): Result<DemoScript, DemoScriptIssue[]> => {
  const issues: DemoScriptIssue[] = [];
  if (!isRecord(input)) return err([{ path: '', message: 'script must be an object' }]);

  for (const field of ['id', 'title'] as const) {
    if (!isNonEmpty(input[field])) issues.push({ path: field, message: `${field} is required` });
  }
  if (input['description'] !== undefined && !isString(input['description'])) {
    issues.push({ path: 'description', message: 'description must be a string' });
  }

  const personas = parsePersonas(input['personas'], issues);
  const steps = parseSteps(input['steps'], new Set(personas.map((p) => p.id)), issues);

  if (issues.length > 0) return err(issues);

  const description = input['description'];
  return ok({
    id: input['id'] as string,
    title: input['title'] as string,
    ...(isString(description) ? { description } : {}),
    personas,
    steps,
  });
};
