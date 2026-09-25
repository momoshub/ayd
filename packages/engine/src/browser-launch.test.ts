import { describe, expect, it } from 'vitest';
import { detectBrowser } from './browser-launch.js';

describe('detectBrowser', () => {
  it('returns a name and, when found, an absolute executable path', () => {
    const info = detectBrowser();
    expect(typeof info.name).toBe('string');
    expect(info.name.length).toBeGreaterThan(0);
    if (info.executablePath !== undefined) {
      expect(info.executablePath.startsWith('/') || /^[A-Za-z]:\\/.test(info.executablePath)).toBe(
        true,
      );
    }
  });

  it('reports "none found" only when it has no executable path', () => {
    const info = detectBrowser();
    if (info.name === 'none found') expect(info.executablePath).toBeUndefined();
  });
});
