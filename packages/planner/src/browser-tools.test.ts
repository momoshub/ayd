import { describe, expect, it } from 'vitest';
import { BROWSER_TOOL_NAMES, toDomainSelector } from './browser-tools.js';

describe('toDomainSelector', () => {
  it('maps each selector kind, dropping absent optionals', () => {
    expect(toDomainSelector({ kind: 'role', role: 'button', name: 'Save' })).toEqual({
      kind: 'role',
      role: 'button',
      name: 'Save',
    });
    expect(toDomainSelector({ kind: 'role', role: 'link' })).toEqual({
      kind: 'role',
      role: 'link',
    });
    expect(toDomainSelector({ kind: 'text', text: 'CUPC' })).toEqual({
      kind: 'text',
      text: 'CUPC',
    });
    expect(toDomainSelector({ kind: 'testId', testId: 'save' })).toEqual({
      kind: 'testId',
      testId: 'save',
    });
    expect(toDomainSelector({ kind: 'label', label: 'Email' })).toEqual({
      kind: 'label',
      label: 'Email',
    });
    expect(toDomainSelector({ kind: 'css', css: '#a' })).toEqual({ kind: 'css', css: '#a' });
  });

  it('returns null when the required field for the kind is missing', () => {
    expect(toDomainSelector({ kind: 'role' })).toBeNull();
    expect(toDomainSelector({ kind: 'text' })).toBeNull();
    expect(toDomainSelector({ kind: 'css' })).toBeNull();
  });
});

describe('BROWSER_TOOL_NAMES', () => {
  it('covers the demo action vocabulary', () => {
    for (const name of [
      'navigate',
      'switchTo',
      'click',
      'type',
      'highlight',
      'waitFor',
      'expect',
      'caption',
    ]) {
      expect(BROWSER_TOOL_NAMES).toContain(name);
    }
  });
});
