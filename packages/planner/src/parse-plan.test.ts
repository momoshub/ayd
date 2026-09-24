import type { PlanRequest } from '@ayd/core';
import { describe, expect, it } from 'vitest';
import { extractDemoScript } from './parse-plan.js';

const request: PlanRequest = {
  description: 'demo',
  personas: [
    { id: 'admin', label: 'ADMIN', color: '#ef4444' },
    { id: 'user', label: 'USER', color: '#22c55e' },
  ],
};

const steps = [
  { action: 'caption', text: 'hello' },
  { action: 'navigate', personaId: 'user', path: '/cases' },
];

describe('extractDemoScript', () => {
  it('parses a fenced ```json block', () => {
    const text =
      'Here you go:\n```json\n' + JSON.stringify({ id: 'x', title: 'X', steps }) + '\n```';
    const r = extractDemoScript(text, request);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.steps).toHaveLength(2);
  });

  it('parses bare JSON with no fence', () => {
    const r = extractDemoScript(JSON.stringify({ id: 'x', title: 'X', steps }), request);
    expect(r.ok).toBe(true);
  });

  it('injects the request personas when the model omits them', () => {
    const r = extractDemoScript(JSON.stringify({ id: 'x', title: 'X', steps }), request);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.personas.map((p) => p.id)).toEqual(['admin', 'user']);
  });

  it('derives an id from the title when the model omits id', () => {
    const r = extractDemoScript(JSON.stringify({ title: 'My Great Demo', steps }), request);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toBe('my-great-demo');
  });

  it('errors on non-JSON', () => {
    const r = extractDemoScript('sorry, I cannot do that', request);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/valid JSON/);
  });

  it('surfaces validation issues for a malformed step', () => {
    const bad = {
      id: 'x',
      title: 'X',
      steps: [{ action: 'navigate', personaId: 'ghost', path: '/x' }],
    };
    const r = extractDemoScript(JSON.stringify(bad), request);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toMatch(/invalid DemoScript/);
      expect(r.error.issues?.some((i) => i.includes('personaId'))).toBe(true);
    }
  });
});
