import { describe, expect, it } from 'vitest';
import {
  emptyMemory,
  recordInteraction,
  rememberFeature,
  slugify,
  summarizeMemory,
} from './memory.js';

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-02T00:00:00.000Z';

describe('slugify', () => {
  it('makes a stable kebab id and never empty', () => {
    expect(slugify('Cases Inbox')).toBe('cases-inbox');
    expect(slugify('  !!!  ')).toBe('feature');
  });
});

describe('rememberFeature', () => {
  it('adds a new feature with seenCount 1', () => {
    const m = rememberFeature(
      emptyMemory('http://x', T0),
      { title: 'Cases Inbox', path: '/cases' },
      T0,
    );
    expect(m.features).toHaveLength(1);
    expect(m.features[0]).toMatchObject({ id: 'cases-inbox', path: '/cases', seenCount: 1 });
  });

  it('merges a re-recorded feature: dedupes selectors, bumps seenCount, keeps newest path', () => {
    let m = rememberFeature(emptyMemory('http://x', T0), { title: 'Inbox', selectors: ['a'] }, T0);
    m = rememberFeature(m, { title: 'Inbox', selectors: ['a', 'b'], path: '/inbox' }, T1);
    expect(m.features).toHaveLength(1);
    expect(m.features[0]?.selectors).toEqual(['a', 'b']);
    expect(m.features[0]?.seenCount).toBe(2);
    expect(m.features[0]?.path).toBe('/inbox');
  });
});

describe('recordInteraction', () => {
  it('appends newest last and caps the log at 100', () => {
    let m = emptyMemory('http://x', T0);
    for (let i = 0; i < 105; i++) m = recordInteraction(m, { summary: `s${String(i)}` }, T0);
    expect(m.interactions).toHaveLength(100);
    expect(m.interactions.at(-1)?.summary).toBe('s104');
    expect(m.interactions[0]?.summary).toBe('s5');
  });
});

describe('summarizeMemory', () => {
  it('nudges investigation when empty', () => {
    expect(summarizeMemory(emptyMemory('http://x', T0))).toMatch(/No prior knowledge/);
  });

  it('lists known features and recent interactions', () => {
    let m = rememberFeature(emptyMemory('http://x', T0), { title: 'Inbox', path: '/inbox' }, T0);
    m = recordInteraction(m, { summary: 'replied to a ticket' }, T0);
    const out = summarizeMemory(m);
    expect(out).toMatch(/Inbox \(\/inbox\)/);
    expect(out).toMatch(/replied to a ticket/);
  });
});
