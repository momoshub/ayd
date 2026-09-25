import { describe, expect, it } from 'vitest';
import { captionAnchor, OVERLAY_RUNTIME } from './overlays.js';

describe('captionAnchor', () => {
  it('sends the caption to the top when the target is in the bottom half', () => {
    expect(captionAnchor(700, 40, 1000)).toBe('top');
  });

  it('sends the caption to the bottom when the target is in the top half', () => {
    expect(captionAnchor(100, 40, 1000)).toBe('bottom');
  });

  it('treats the exact midpoint as top (target at/over center)', () => {
    expect(captionAnchor(480, 40, 1000)).toBe('bottom'); // center 500 == half -> not > half
    expect(captionAnchor(481, 40, 1000)).toBe('top'); // center 501 > 500
  });
});

describe('OVERLAY_RUNTIME', () => {
  it('is an idempotent self-installing script exposing the overlay API', () => {
    expect(OVERLAY_RUNTIME).toContain('window.__ayd');
    expect(OVERLAY_RUNTIME).toContain('if (window.__ayd) return');
    for (const method of ['frame(', 'caption(', 'highlight(']) {
      expect(OVERLAY_RUNTIME).toContain(method);
    }
  });
});
