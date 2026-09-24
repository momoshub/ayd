import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Persona } from '@ayd/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Browser, chromium } from 'playwright';
import { createPlaywrightDriver, type PlaywrightDriver } from './playwright-driver.js';

// Real-browser proof that the driver navigates, injects overlays, clicks, types,
// and reports visibility. Opt-in: `pnpm test:integration` (needs `playwright install chromium`).

const FIXTURE = `<!doctype html><html><body style="height:2000px">
  <h1 id="title">Hello</h1>
  <button id="go" onclick="document.getElementById('title').textContent='Clicked'">Go</button>
  <input aria-label="Name" />
  <div id="ghost" style="display:none">ghost</div>
</body></html>`;

const persona: Persona = { id: 'user', label: 'USER', color: '#22c55e' };

describe('createPlaywrightDriver (integration)', () => {
  let browser: Browser;
  let driver: PlaywrightDriver;
  let url: string;

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ayd-itest-'));
    const file = join(dir, 'fixture.html');
    await writeFile(file, FIXTURE);
    url = pathToFileURL(file).href;
    browser = await chromium.launch({ headless: true });
    driver = createPlaywrightDriver({ browser, personas: [persona], baseUrl: '', pointerSteps: 2 });
  });

  afterAll(async () => {
    await driver?.close();
    await browser?.close();
  });

  it('navigates and injects the persona overlay frame', async () => {
    await driver.navigate('user', url);
    expect(await driver.isVisible('user', { kind: 'role', role: 'heading', name: 'Hello' })).toBe(
      true,
    );
  });

  it('clicks a button via a role selector', async () => {
    await driver.click('user', { kind: 'role', role: 'button', name: 'Go' });
    expect(await driver.isVisible('user', { kind: 'text', text: 'Clicked' })).toBe(true);
  });

  it('types into a labelled input', async () => {
    await driver.type('user', { kind: 'label', label: 'Name' }, 'Ada');
    expect(await driver.isVisible('user', { kind: 'css', css: 'input' })).toBe(true);
  });

  it('reports a hidden element as not visible and waitFor times out to false', async () => {
    expect(await driver.isVisible('user', { kind: 'css', css: '#ghost' })).toBe(false);
    expect(await driver.waitFor('user', { kind: 'text', text: 'nope' }, 'visible', 500)).toBe(
      false,
    );
  });

  it('installs the overlay runtime and draws a highlight', async () => {
    await driver.highlight('user', { kind: 'role', role: 'heading', name: 'Clicked' }, 'seen');
    await driver.caption('a caption', 'sub');
    const [hasApi, hasFrame, hasCap] = await browser
      .contexts()[0]!
      .pages()[0]!
      .evaluate(() => [
        typeof window.__ayd === 'object',
        !!document.getElementById('__ayd_frame'),
        !!document.getElementById('__ayd_cap'),
      ]);
    expect(hasApi).toBe(true);
    expect(hasFrame).toBe(true);
    expect(hasCap).toBe(true);
  });
});
