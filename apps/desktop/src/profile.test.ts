import { describe, expect, it } from 'vitest';
import { parseProfile } from './profile.js';

const valid = {
  baseUrl: 'http://localhost:3000',
  personas: [
    { id: 'admin', label: 'ADMIN', color: '#ef4444' },
    { id: 'user', label: 'USER', color: '#22c55e' },
  ],
};

describe('parseProfile', () => {
  it('accepts a well-formed profile', () => {
    const r = parseProfile(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.personas).toHaveLength(2);
  });

  it('rejects a non-object', () => {
    expect(parseProfile('x').ok).toBe(false);
  });

  it('requires baseUrl and at least one persona', () => {
    const r = parseProfile({ personas: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('baseUrl is required');
      expect(r.error).toContain('at least one persona is required');
    }
  });

  it('flags a persona missing fields', () => {
    const r = parseProfile({ ...valid, personas: [{ id: 'a', label: 'A' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.some((e) => e.includes('personas[0]'))).toBe(true);
  });
});
