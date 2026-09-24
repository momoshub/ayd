/**
 * A driver-agnostic way to point at an element. The domain speaks in intent
 * (a role, some text, a test id); the BrowserDriver adapter translates this to
 * Playwright locators, so the domain never depends on any automation library.
 */
export type Selector =
  | {
      readonly kind: 'role';
      readonly role: string;
      readonly name?: string;
      readonly exact?: boolean;
    }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'testId'; readonly testId: string }
  | { readonly kind: 'label'; readonly label: string }
  | { readonly kind: 'css'; readonly css: string };

export type SelectorKind = Selector['kind'];

/** Human-readable form for logs and captions. */
export const describeSelector = (s: Selector): string => {
  switch (s.kind) {
    case 'role':
      return s.name ? `${s.role} "${s.name}"` : `${s.role}`;
    case 'text':
      return `text "${s.text}"`;
    case 'testId':
      return `testId "${s.testId}"`;
    case 'label':
      return `label "${s.label}"`;
    case 'css':
      return s.css;
  }
};
