import { describe, expect, it } from 'vitest';
import { parseDemoScript } from './demo-script.js';

const validRaw = {
  id: 'cpv2',
  title: 'Case Permissions V2',
  description: 'admin grants, scoped user sees the change',
  personas: [
    { id: 'admin', label: 'ADMIN', color: '#ef4444' },
    { id: 'user', label: 'USER', color: '#22c55e' },
  ],
  steps: [
    { action: 'caption', text: 'Case Permissions V2' },
    { action: 'navigate', personaId: 'user', path: '/cases', caption: 'the scoped user' },
    { action: 'click', personaId: 'admin', target: { kind: 'role', role: 'button', name: 'Save' } },
    {
      action: 'expect',
      personaId: 'user',
      target: { kind: 'text', text: 'CUPC' },
      toBe: 'visible',
    },
  ],
};

const expectIssue = (input: unknown, path: string): void => {
  const result = parseDemoScript(input);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.map((i) => i.path)).toContain(path);
};

describe('parseDemoScript', () => {
  it('accepts a well-formed script and preserves order', () => {
    const result = parseDemoScript(validRaw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('cpv2');
    expect(result.value.personas).toHaveLength(2);
    expect(result.value.steps.map((s) => s.action)).toEqual([
      'caption',
      'navigate',
      'click',
      'expect',
    ]);
  });

  it('omits description when absent (exactOptionalPropertyTypes)', () => {
    const { description: _drop, ...noDesc } = validRaw;
    const result = parseDemoScript(noDesc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('description' in result.value).toBe(false);
  });

  it('rejects a non-object', () => {
    expectIssue('nope', '');
  });

  it('requires id and title', () => {
    expectIssue({ ...validRaw, id: '', title: '   ' }, 'id');
    expectIssue({ ...validRaw, title: '' }, 'title');
  });

  it('requires at least one persona with id/label/color', () => {
    expectIssue({ ...validRaw, personas: [] }, 'personas');
    expectIssue({ ...validRaw, personas: [{ id: 'x', label: 'X' }] }, 'personas[0].color');
  });

  it('rejects duplicate persona ids', () => {
    const personas = [
      { id: 'admin', label: 'A', color: '#111' },
      { id: 'admin', label: 'B', color: '#222' },
    ];
    expectIssue({ ...validRaw, personas }, 'personas[1].id');
  });

  it('rejects a step referencing an unknown persona', () => {
    const steps = [{ action: 'navigate', personaId: 'ghost', path: '/x' }];
    expectIssue({ ...validRaw, steps }, 'steps[0].personaId');
  });

  it('rejects an unknown action', () => {
    expectIssue(
      { ...validRaw, steps: [{ action: 'teleport', personaId: 'admin' }] },
      'steps[0].action',
    );
  });

  it('rejects a selector missing its required field', () => {
    const steps = [{ action: 'click', personaId: 'admin', target: { kind: 'role' } }];
    expectIssue({ ...validRaw, steps }, 'steps[0].target.role');
  });

  it('requires scalar fields per action (type.text, navigate.path)', () => {
    expectIssue(
      { ...validRaw, steps: [{ action: 'navigate', personaId: 'admin' }] },
      'steps[0].path',
    );
    const typeStep = [{ action: 'type', personaId: 'admin', target: { kind: 'css', css: '#a' } }];
    expectIssue({ ...validRaw, steps: typeStep }, 'steps[0].text');
  });

  it('reports every problem at once', () => {
    const result = parseDemoScript({ personas: [], steps: 'no' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThanOrEqual(3); // id, title, personas, steps
  });
});
