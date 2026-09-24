import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';

describe('parseArgs', () => {
  it('requires a script path', () => {
    const r = parseArgs([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/usage/);
  });

  it('defaults to headed with a 1200ms pace', () => {
    const r = parseArgs(['demo.json']);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value).toMatchObject({ scriptPath: 'demo.json', headed: true, paceMs: 1200 });
  });

  it('--headless defaults pace to 0', () => {
    const r = parseArgs(['demo.json', '--headless']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ headed: false, paceMs: 0 });
  });

  it('parses --base-url and --pace', () => {
    const r = parseArgs(['demo.json', '--base-url=http://localhost:3000', '--pace=500']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ baseUrl: 'http://localhost:3000', paceMs: 500 });
  });

  it('omits baseUrl when not given', () => {
    const r = parseArgs(['demo.json']);
    expect(r.ok).toBe(true);
    if (r.ok) expect('baseUrl' in r.value).toBe(false);
  });

  it('rejects a bad --pace and unknown flags', () => {
    expect(parseArgs(['d.json', '--pace=abc']).ok).toBe(false);
    expect(parseArgs(['d.json', '--nope']).ok).toBe(false);
  });
});
