/**
 * A read-only view of a persona's current page, used for self-investigation: the
 * agent "looks" at the page to decide where to go and what to record in memory.
 * Kept deliberately compact so it fits in a prompt.
 */
export interface PageObservation {
  readonly url: string;
  readonly title: string;
  readonly headings: readonly string[];
  readonly links: readonly { readonly text: string; readonly href: string }[];
  /** Labels of interactive controls (buttons, inputs, menu items). */
  readonly controls: readonly string[];
  /** document.readyState: 'loading' | 'interactive' | 'complete'. */
  readonly readyState?: string;
  /** True while the page is still loading (not complete, or a spinner is visible). */
  readonly loading?: boolean;
}

export interface PageObserver {
  observe(personaId: string): Promise<PageObservation>;
}
