import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Clock, type Result, parseDemoScript, planAndRun, runScript } from '@ayd/core';
import { createPlaywrightDriver } from '@ayd/engine';
import { createClaudeAgentPlanner } from '@ayd/planner';
import { app, BrowserWindow, ipcMain } from 'electron';
import { type Browser, chromium } from 'playwright';
import { createIpcPresenter, IPC } from './ipc.js';
import { type DemoProfile, parseProfile } from './profile.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const PACE_MS = Number(process.env.AYD_PACE_MS ?? 2500);
const profilePath = process.env.AYD_PROFILE ?? join(process.cwd(), 'config/local/profile.json');

const nodeClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

let controlWindow: BrowserWindow | null = null;
let activeBrowser: Browser | null = null;

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

const openBrowser = async (): Promise<Browser> => {
  await activeBrowser?.close().catch(() => undefined);
  activeBrowser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  return activeBrowser;
};

const closeBrowser = async (): Promise<void> => {
  await activeBrowser?.close().catch(() => undefined);
  activeBrowser = null;
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
    const browser = await openBrowser();
    const driver = createPlaywrightDriver({
      browser,
      personas: parsed.value.personas,
      baseUrl: profile.ok ? profile.value.baseUrl : '',
    });
    try {
      const report = await runScript(parsed.value, {
        driver,
        presenter: createIpcPresenter(send),
        clock: nodeClock,
        paceMs: PACE_MS,
      });
      return { ok: true, report };
    } finally {
      await driver.close();
      await closeBrowser();
    }
  });

  ipcMain.handle(IPC.planAndRun, async (_e, description: string) => {
    const profile = await loadProfile();
    if (!profile.ok) return { ok: false, error: profile.error };

    const browser = await openBrowser();
    const driver = createPlaywrightDriver({
      browser,
      personas: profile.value.personas,
      baseUrl: profile.value.baseUrl,
    });
    try {
      const result = await planAndRun(
        { description, personas: profile.value.personas, baseUrl: profile.value.baseUrl },
        {
          planner: createClaudeAgentPlanner(),
          driver,
          presenter: createIpcPresenter(send),
          clock: nodeClock,
          paceMs: PACE_MS,
        },
      );
      if (!result.ok)
        return { ok: false, error: [result.error.message, ...(result.error.issues ?? [])] };
      return { ok: true, report: result.value.report, script: result.value.script };
    } finally {
      await driver.close();
      await closeBrowser();
    }
  });

  ipcMain.handle(IPC.stop, () => closeBrowser());
};

const createWindow = (): void => {
  controlWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'ayd — demo runner',
    webPreferences: {
      preload: join(here, 'preload.js'),
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
  void closeBrowser();
  if (process.platform !== 'darwin') app.quit();
});
