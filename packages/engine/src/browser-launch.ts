import { existsSync } from 'node:fs';
import { chromium, type Browser, type LaunchOptions } from 'playwright';

/**
 * A Chromium-based browser to drive. `executablePath` undefined means "use
 * Playwright's own bundled Chromium" (only present if `playwright install` was
 * run) — the packaged app ships no browser, so it relies on a system one.
 */
export interface BrowserInfo {
  readonly name: string;
  readonly executablePath?: string;
}

// Common install locations for Chromium-based browsers, most-preferred first.
// A packaged demo runner drives the user's real browser, so we look for one here
// instead of downloading Playwright's ~150MB Chromium.
const CANDIDATES: readonly { readonly name: string; readonly paths: readonly string[] }[] = [
  {
    name: 'Google Chrome',
    paths: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ],
  },
  {
    name: 'Microsoft Edge',
    paths: [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      '/usr/bin/microsoft-edge',
    ],
  },
  {
    name: 'Brave',
    paths: [
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      '/usr/bin/brave-browser',
    ],
  },
  {
    name: 'Chromium',
    paths: [
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ],
  },
];

/** Find an installed Chromium-based browser, or report that none was found. */
export const detectBrowser = (): BrowserInfo => {
  for (const c of CANDIDATES) {
    const found = c.paths.find((p) => existsSync(p));
    if (found !== undefined) return { name: c.name, executablePath: found };
  }
  return { name: 'none found' };
};

/**
 * Launch a visible browser for a demo, preferring a system Chrome/Chromium-based
 * install (so no Playwright browser download is needed), and falling back to the
 * bundled Chromium if a detected browser refuses to launch.
 */
export const launchDemoBrowser = async (
  options?: LaunchOptions,
): Promise<{ browser: Browser; info: BrowserInfo }> => {
  const info = detectBrowser();
  const base: LaunchOptions = { headless: false, args: ['--start-maximized'], ...options };
  const withExe: LaunchOptions =
    info.executablePath !== undefined ? { ...base, executablePath: info.executablePath } : base;
  try {
    return { browser: await chromium.launch(withExe), info };
  } catch (e) {
    // A detected browser can still fail (version drift, permissions). Fall back to
    // Playwright's bundled Chromium if it is installed; otherwise surface the error.
    if (info.executablePath !== undefined) {
      return { browser: await chromium.launch(base), info: { name: 'bundled Chromium' } };
    }
    throw e;
  }
};
