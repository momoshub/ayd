/**
 * The app's long-term memory: a "feature map" of what the agent has learned about
 * the target app, plus a log of past interactions. Pure and framework-free — the
 * persistence adapter (a file, a DB) lives behind the MemoryStore port. The agent
 * reads a summary of this at the start of a session and writes back to it as it
 * investigates, so knowledge compounds across runs.
 */

/** One thing learned about the target app, keyed by a stable slug of its title. */
export interface FeatureNote {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  /** Where it lives, as a relative path (e.g. '/cases/inbox'). */
  readonly path?: string;
  /** Selectors that reached it, so the agent can go straight there next time. */
  readonly selectors?: readonly string[];
  readonly tags?: readonly string[];
  /** How many times it's been recorded — a rough confidence/importance signal. */
  readonly seenCount: number;
  readonly updatedAt: string;
}

/** One past operator/agent exchange, oldest first. */
export interface InteractionNote {
  readonly at: string;
  readonly summary: string;
  readonly personaId?: string;
}

/** Everything remembered about one app, keyed by its base URL. */
export interface AppMemory {
  readonly baseUrl: string;
  readonly features: readonly FeatureNote[];
  readonly interactions: readonly InteractionNote[];
  readonly updatedAt: string;
}

/** What the agent supplies when recording a feature; the id is derived. */
export interface FeatureInput {
  readonly title: string;
  readonly description?: string;
  readonly path?: string;
  readonly selectors?: readonly string[];
  readonly tags?: readonly string[];
}

/** Keep the interaction log bounded so the file (and the prompt) never grow without limit. */
const MAX_INTERACTIONS = 100;

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'feature';

export const emptyMemory = (baseUrl: string, now: string): AppMemory => ({
  baseUrl,
  features: [],
  interactions: [],
  updatedAt: now,
});

const mergeList = (a?: readonly string[], b?: readonly string[]): readonly string[] | undefined => {
  const merged = [...new Set([...(a ?? []), ...(b ?? [])].map((v) => v.trim()).filter(Boolean))];
  return merged.length > 0 ? merged : undefined;
};

/**
 * Record (or update) a feature. Re-recording the same title merges selectors/tags,
 * keeps the newest description/path, and bumps seenCount — so repeated visits sharpen
 * the note rather than duplicating it.
 */
export const rememberFeature = (memory: AppMemory, input: FeatureInput, now: string): AppMemory => {
  const id = slugify(input.title);
  const existing = memory.features.find((f) => f.id === id);
  const description = input.description ?? existing?.description;
  const path = input.path ?? existing?.path;
  const selectors = mergeList(existing?.selectors, input.selectors);
  const tags = mergeList(existing?.tags, input.tags);
  const note: FeatureNote = {
    id,
    title: input.title.trim() || existing?.title || 'feature',
    seenCount: (existing?.seenCount ?? 0) + 1,
    updatedAt: now,
    ...(description !== undefined ? { description } : {}),
    ...(path !== undefined ? { path } : {}),
    ...(selectors !== undefined ? { selectors } : {}),
    ...(tags !== undefined ? { tags } : {}),
  };
  const features = existing
    ? memory.features.map((f) => (f.id === id ? note : f))
    : [...memory.features, note];
  return { ...memory, features, updatedAt: now };
};

export const recordInteraction = (
  memory: AppMemory,
  note: { readonly summary: string; readonly personaId?: string },
  now: string,
): AppMemory => {
  const entry: InteractionNote = {
    at: now,
    summary: note.summary,
    ...(note.personaId !== undefined ? { personaId: note.personaId } : {}),
  };
  return {
    ...memory,
    interactions: [...memory.interactions, entry].slice(-MAX_INTERACTIONS),
    updatedAt: now,
  };
};

/** A compact, prompt-ready view of what we know — fed to the agent at session start. */
export const summarizeMemory = (memory: AppMemory): string => {
  if (memory.features.length === 0 && memory.interactions.length === 0) {
    return 'No prior knowledge of this app yet. Investigate as you go and record what you find.';
  }
  const feats = [...memory.features]
    .sort((a, b) => b.seenCount - a.seenCount)
    .slice(0, 20)
    .map(
      (f) =>
        `- ${f.title}${f.path !== undefined ? ` (${f.path})` : ''}${f.description !== undefined ? `: ${f.description}` : ''}`,
    )
    .join('\n');
  const recent = memory.interactions
    .slice(-5)
    .map((i) => `- ${i.summary}`)
    .join('\n');
  return [feats ? `Known features:\n${feats}` : '', recent ? `Recent interactions:\n${recent}` : '']
    .filter(Boolean)
    .join('\n\n');
};
