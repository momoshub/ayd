import type { PlanRequest } from '@ayd/core';

export interface PlannerPrompt {
  readonly system: string;
  readonly user: string;
}

/** The step actions the model may emit; kept in sync with core's Step union. */
export const PLANNER_ACTIONS = [
  'caption',
  'switchTo',
  'navigate',
  'click',
  'type',
  'highlight',
  'waitFor',
  'expect',
] as const;

const SCHEMA = [
  'A DemoScript is JSON: { "id": string, "title": string, "description"?: string,',
  '  "personas": [{ "id", "label", "color" }], "steps": [Step, ...] }.',
  `Each Step has "action" (one of: ${PLANNER_ACTIONS.join(', ')}).`,
  'Browser steps also carry "personaId" (one of the given persona ids). "caption" does not.',
  'Selectors are { "kind": "role"|"text"|"testId"|"label"|"css", ... }:',
  '  role → { kind:"role", role, name?, exact? }; text → { kind:"text", text };',
  '  testId → { kind:"testId", testId }; label → { kind:"label", label }; css → { kind:"css", css }.',
  'Step fields: navigate{personaId,path,caption?}, click{personaId,target}, type{personaId,target,text,submit?},',
  '  highlight{personaId,target,label?}, waitFor{personaId,target,state?,timeoutMs?},',
  '  expect{personaId,target,toBe:"visible"|"hidden",label?}, switchTo{personaId,caption?}, caption{text,sub?}.',
].join('\n');

/**
 * Build the system + user prompt that asks the model to compile a description
 * into a DemoScript. Pure and unit-tested; the SDK glue only transports it.
 */
export const buildPlannerPrompt = (request: PlanRequest): PlannerPrompt => {
  const personas = request.personas.map((p) => `- ${p.id} ("${p.label}")`).join('\n');
  const system = [
    'You write demo scripts for "ayd", a product-demo runner that drives real browsers.',
    'Return exactly one JSON object matching the DemoScript schema, and nothing else —',
    'no prose, no markdown outside a single fenced code block.',
    '',
    SCHEMA,
    '',
    'Rules: use only the provided persona ids; prefer role/text/label selectors over css;',
    'open with a caption, switch personas explicitly with switchTo, and assert visible outcomes',
    'with expect so the run self-checks.',
  ].join('\n');

  const user = [
    `Demo to script:\n${request.description}`,
    request.baseUrl !== undefined ? `\nApp base URL: ${request.baseUrl}` : '',
    `\nPersonas you may drive:\n${personas}`,
    request.hints !== undefined ? `\nHints:\n${request.hints}` : '',
    '\nReturn only the DemoScript JSON.',
  ]
    .filter((s) => s !== '')
    .join('\n');

  return { system, user };
};
