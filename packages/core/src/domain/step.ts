import type { Selector } from './selector.js';

/**
 * The demo action vocabulary. A DemoScript is an ordered list of these. Steps
 * that touch the browser name the persona whose window they act on; `caption`
 * is chrome-only and persona-agnostic.
 */
export type Step =
  | { readonly action: 'caption'; readonly text: string; readonly sub?: string }
  | { readonly action: 'switchTo'; readonly personaId: string; readonly caption?: string }
  | {
      readonly action: 'navigate';
      readonly personaId: string;
      readonly path: string;
      readonly caption?: string;
    }
  | {
      readonly action: 'click';
      readonly personaId: string;
      readonly target: Selector;
      readonly label?: string;
    }
  | {
      readonly action: 'type';
      readonly personaId: string;
      readonly target: Selector;
      readonly text: string;
      readonly submit?: boolean;
    }
  | {
      readonly action: 'highlight';
      readonly personaId: string;
      readonly target: Selector;
      readonly label?: string;
    }
  | {
      readonly action: 'waitFor';
      readonly personaId: string;
      readonly target: Selector;
      readonly state?: 'visible' | 'hidden';
      readonly timeoutMs?: number;
    }
  | {
      readonly action: 'expect';
      readonly personaId: string;
      readonly target: Selector;
      readonly toBe: 'visible' | 'hidden';
      readonly label?: string;
    };

export type StepAction = Step['action'];

/** Steps that carry a personaId (everything except `caption`). */
export type PersonaStep = Extract<Step, { personaId: string }>;

export const stepHasPersona = (step: Step): step is PersonaStep => step.action !== 'caption';
