import type { Selector } from '../domain/selector.js';

/**
 * The only way the application touches a browser. Implemented in packages/engine
 * by a Playwright adapter; faked in tests. Everything is persona-scoped so the
 * driver knows which window to act on.
 */
export interface BrowserDriver {
  /** Open (or focus) a persona's isolated session and paint its colour frame. */
  bringToFront(personaId: string): Promise<void>;
  navigate(personaId: string, path: string): Promise<void>;
  click(personaId: string, target: Selector, label?: string): Promise<void>;
  type(
    personaId: string,
    target: Selector,
    text: string,
    opts?: { readonly submit?: boolean },
  ): Promise<void>;
  highlight(personaId: string, target: Selector, label?: string): Promise<void>;
  waitFor(
    personaId: string,
    target: Selector,
    state: 'visible' | 'hidden',
    timeoutMs: number,
  ): Promise<boolean>;
  isVisible(personaId: string, target: Selector): Promise<boolean>;
  /** Chrome-only banner shown across all windows. */
  caption(text: string, sub?: string): Promise<void>;
}
