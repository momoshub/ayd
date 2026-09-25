import type { Selector } from '@ayd/core';
import { describe, expect, it } from 'vitest';
import { toLocatorCall } from './locator.js';

describe('toLocatorCall', () => {
  it('maps a role selector with name + exact', () => {
    const s: Selector = { kind: 'role', role: 'button', name: 'Save', exact: true };
    expect(toLocatorCall(s)).toEqual({
      method: 'getByRole',
      role: 'button',
      name: 'Save',
      exact: true,
    });
  });

  it('omits name/exact when absent (no undefined keys)', () => {
    const call = toLocatorCall({ kind: 'role', role: 'link' });
    expect(call).toEqual({ method: 'getByRole', role: 'link' });
    expect('name' in call).toBe(false);
    expect('exact' in call).toBe(false);
  });

  it('maps text, testId, label, css', () => {
    expect(toLocatorCall({ kind: 'text', text: 'CUPC' })).toEqual({
      method: 'getByText',
      text: 'CUPC',
    });
    expect(toLocatorCall({ kind: 'testId', testId: 'save' })).toEqual({
      method: 'getByTestId',
      testId: 'save',
    });
    expect(toLocatorCall({ kind: 'label', label: 'Email' })).toEqual({
      method: 'getByLabel',
      label: 'Email',
    });
    expect(toLocatorCall({ kind: 'css', css: '.x' })).toEqual({ method: 'locator', css: '.x' });
  });
});
