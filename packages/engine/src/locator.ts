import type { Selector } from '@ayd/core';

/**
 * A pure description of which Playwright locator factory call a Selector maps to.
 * Kept separate from the Playwright call itself so the mapping is unit-testable
 * without a browser; `resolveLocator` (glue) turns this into a real Locator.
 */
export type LocatorCall =
  | {
      readonly method: 'getByRole';
      readonly role: string;
      readonly name?: string;
      readonly exact?: boolean;
    }
  | { readonly method: 'getByText'; readonly text: string }
  | { readonly method: 'getByTestId'; readonly testId: string }
  | { readonly method: 'getByLabel'; readonly label: string }
  | { readonly method: 'locator'; readonly css: string };

export const toLocatorCall = (selector: Selector): LocatorCall => {
  switch (selector.kind) {
    case 'role':
      return {
        method: 'getByRole',
        role: selector.role,
        ...(selector.name !== undefined ? { name: selector.name } : {}),
        ...(selector.exact !== undefined ? { exact: selector.exact } : {}),
      };
    case 'text':
      return { method: 'getByText', text: selector.text };
    case 'testId':
      return { method: 'getByTestId', testId: selector.testId };
    case 'label':
      return { method: 'getByLabel', label: selector.label };
    case 'css':
      return { method: 'locator', css: selector.css };
  }
};
