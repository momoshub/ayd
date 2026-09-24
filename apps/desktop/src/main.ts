import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Clock,
  type Persona,
  type Result,
  parseDemoScript,
  planAndRun,
  runScript,
} from '@ayd/core';
import { createPlaywrightDriver, type PlaywrightDriver } from '@ayd/engine';
import { createClaudeAgentPlanner } from '@ayd/planner';
import { app, BrowserWindow, ipcMain } from 'electron';
import { type Browser, chromium } from 'playwright';
import { createIpcPresenter, IPC } from './ipc.js';
import { type DemoProfile, parseProfile } from './profile.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const rawPace = Number(process.env.AYD_PACE_MS ?? 2500);
const PACE_MS = Number.isFinite(rawPace) ? rawPace : 2500;
const profilePath = process.env.AYD_PROFILE ?? join(process.cwd(), 'config/local/profile.json');

const nodeClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

type Failure = { ok: false; error: string[] };

let controlWindow: BrowserWindow | null = null;
let activeBrowser: Browser | null = null;
let activeController: AbortController | null = null;
let running = false;

const send = (channel: string, payload: unknown): void => {
  controlWindow?.webContents.send(channel, payload);
};

const loadProfile = async (): Promise<Result<DemoProfile, string[]>> => {
  try {
    return parseProfile(JSON.parse(await readFile(profilePath, 'utf8')));
  } catch (e) {
    return { ok: false, error: [`could not read profile at ${profilePath}: ${String(e)}`] };
  }
};

/**
 * The one guarded path a demo run takes: reject if a run is already active,
 * else launch a browser + driver, hand `body` an AbortSignal, and always tear
 * down. The run-lock prevents a second Run/Plan click from closing the first
 * run's browser out from under it.
 */
const withDemoRun = async <T>(
  personas: readonly Persona[],
  baseUrl: string,
  body: (driver: PlaywrightDriver, signal: AbortSignal) => Promise<T>,
): Promise<T | Failure> => {
  if (running) return { ok: false, error: ['a run is already in progress — stop it first'] };
  running = true;
  const controller = new AbortController();
  activeController = controller;
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  activeBrowser = browser;
  const driver = createPlaywrightDriver({ browser, personas, baseUrl });
  try {
    return await body(driver, controller.signal);
  } finally {
    await driver.close();
    await browser.close().catch(() => undefined);
    activeBrowser = null;
    activeController = null;
    running = false;
  }
};

const registerIpc = (): void => {
  ipcMain.handle(IPC.getProfile, () => loadProfile());

  ipcMain.handle(IPC.runScript, async (_e, scriptJson: string) => {
    let raw: unknown;
    try {
      raw = JSON.parse(scriptJson);
    } catch {
      return { ok: false, error: ['script is not valid JSON'] };
    }
    const parsed = parseDemoScript(raw);
    if (!parsed.ok) return { ok: false, error: parsed.error.map((i) => `${i.path}: ${i.message}`) };
    const profile = await loadProfile();
    return withDemoRun(
      parsed.value.personas,
      profile.ok ? profile.value.baseUrl : '',
      async (driver, signal) => {
        const report = await runScript(parsed.value, {
          driver,
          presenter: createIpcPresenter(send),
          clock: nodeClock,
          paceMs: PACE_MS,
          signal,
        });
        return { ok: true, report };
      },
    );
  });

  ipcMain.handle(IPC.planAndRun, async (_e, description: string) => {
    const profile = await loadProfile();
    if (!profile.ok) return { ok: false, error: profile.error };
    const { personas, baseUrl } = profile.value;
    return withDemoRun(personas, baseUrl, async (driver, signal) => {
      const result = await planAndRun(
        { description, personas, baseUrl },
        {
          planner: createClaudeAgentPlanner(),
          driver,
          presenter: createIpcPresenter(send),
          clock: nodeClock,
          paceMs: PACE_MS,
          signal,
        },
      );
      if (!result.ok)
        return { ok: false, error: [result.error.message, ...(result.error.issues ?? [])] };
      return { ok: true, report: result.value.report, script: result.value.script };
    });
  });

  // Abort the run loop (stops between steps) AND close the browser so an in-flight
  // step's Playwright call rejects instead of hanging.
  ipcMain.handle(IPC.stop, async () => {
    activeController?.abort();
    await activeBrowser?.close().catch(() => undefined);
  });
};

const createWindow = (): void => {
  controlWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'ayd — demo runner',
    webPreferences: {
      preload: join(here, 'preload.js'),
      // contextIsolation + no nodeIntegration are the load-bearing protections here.
      // sandbox is off because the ESM preload uses `import`; a sandboxed preload
      // must be CommonJS. Content is local/static, so the residual risk is low. To
      // flip sandbox on, bundle the preload to CJS first (see docs/adr/0003).
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void controlWindow.loadFile(join(here, 'renderer/index.html'));
  controlWindow.on('closed', () => {
    controlWindow = null;
  });
};

void app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  activeController?.abort();
  void activeBrowser?.close().catch(() => undefined);
  if (process.platform !== 'darwin') app.quit();
});
