import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AgentMessage,
  type AgentSession,
  type AppMemory,
  type Clock,
  type ConversationTurn,
  ok,
  type Persona,
  recordInteraction,
  rememberFeature,
  type Result,
  parseDemoScript,
  planAndRun,
  runScript,
} from '@ayd/core';
import { createPlaywrightDriver, launchDemoBrowser, type PlaywrightDriver } from '@ayd/engine';
import { type AgentMemory, createClaudeAgentPlanner, createInteractiveAgent } from '@ayd/planner';
import { app, BrowserWindow, ipcMain } from 'electron';
import type { Browser } from 'playwright';
import { applyStoredToken, loadToken, saveToken } from './credentials.js';
import { createFileConversationStore, newConversationId } from './conversation-store.js';
import { createIpcPresenter, IPC } from './ipc.js';
import { createFileMemoryStore } from './memory-store.js';
import { DEFAULT_PROFILE, type DemoProfile, parseProfile } from './profile.js';
import { runPreflight } from './preflight.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const rawPace = Number(process.env.AYD_PACE_MS ?? 2500);
const PACE_MS = Number.isFinite(rawPace) ? rawPace : 2500;

// The profile lives in the OS user-data dir so the app is a self-contained GUI:
// no file to hand-edit, nothing in the repo. AYD_PROFILE still overrides it for
// tests and headless runs. app.getPath is only safe after ready, so resolve lazily.
const getProfilePath = (): string =>
  process.env.AYD_PROFILE ?? join(app.getPath('userData'), 'profile.json');

const nodeClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

type Failure = { ok: false; error: string[] };

let controlWindow: BrowserWindow | null = null;
let activeBrowser: Browser | null = null;
let activeController: AbortController | null = null;
let running = false;

// Live interactive chat session (kept open across turns, unlike a one-shot run).
let activeSession: AgentSession | null = null;
let sessionBrowser: Browser | null = null;
let sessionDriver: PlaywrightDriver | null = null;

const conversationStore = createFileConversationStore();

// Per-session live state for the transcript + tab-progress view.
interface SessionState {
  id: string;
  startedAt: string;
  baseUrl: string;
  title: string;
  turns: ConversationTurn[];
  personas: readonly Persona[];
  activity: Map<string, string>;
  busy: boolean;
}
let sessionState: SessionState | null = null;
let tabTimer: ReturnType<typeof setInterval> | null = null;

const send = (channel: string, payload: unknown): void => {
  controlWindow?.webContents.send(channel, payload);
};

const saveConversation = async (): Promise<void> => {
  if (!sessionState || sessionState.turns.length === 0) return;
  await conversationStore
    .save({
      id: sessionState.id,
      startedAt: sessionState.startedAt,
      updatedAt: new Date().toISOString(),
      baseUrl: sessionState.baseUrl,
      title: sessionState.title,
      turns: sessionState.turns,
    })
    .catch(() => undefined);
};

const endSession = async (): Promise<void> => {
  if (tabTimer) {
    clearInterval(tabTimer);
    tabTimer = null;
  }
  await saveConversation();
  await activeSession?.end().catch(() => undefined);
  activeSession = null;
  await sessionDriver?.close().catch(() => undefined);
  await sessionBrowser?.close().catch(() => undefined);
  sessionDriver = null;
  sessionBrowser = null;
  sessionState = null;
  running = false;
};

/** The persona whose id leads an action detail like "admin /cases", if any. */
const personaOf = (
  detail: string | undefined,
  personas: readonly Persona[],
): string | undefined => {
  if (detail === undefined) return undefined;
  const first = detail.split(/\s+/)[0];
  return personas.some((p) => p.id === first) ? first : undefined;
};

/** Fold a streamed agent message into the transcript + tab-activity/busy state. */
const recordTurn = (m: AgentMessage): void => {
  if (!sessionState) return;
  sessionState.turns.push({ at: new Date().toISOString(), message: m });
  if (m.kind === 'action') {
    sessionState.busy = true;
    const pid = personaOf(m.detail, sessionState.personas);
    if (pid !== undefined) {
      sessionState.activity.set(pid, m.detail !== undefined ? `${m.tool} ${m.detail}` : m.tool);
    }
  } else if (m.kind === 'assistant') {
    sessionState.busy = true;
  } else if (m.kind === 'status' && m.text.startsWith('you:')) {
    sessionState.busy = true;
  } else if (m.kind === 'done' || m.kind === 'error') {
    sessionState.busy = false;
  }
};

const pushTabs = async (): Promise<void> => {
  if (!sessionDriver || !sessionState) return;
  const tabs = await sessionDriver.listTabs().catch(() => []);
  send(IPC.tabUpdate, {
    tabs,
    busy: sessionState.busy,
    activity: Object.fromEntries(sessionState.activity),
  });
};

/**
 * Load the profile, distinguishing "never configured" (no file -> usable defaults)
 * from "configured but broken" (bad JSON/schema -> surface the error). `configured`
 * lets the UI decide whether to nudge the operator into Settings on first launch.
 */
const loadProfileDetailed = async (): Promise<{
  result: Result<DemoProfile, string[]>;
  configured: boolean;
}> => {
  let raw: string;
  try {
    raw = await readFile(getProfilePath(), 'utf8');
  } catch {
    return { result: ok(DEFAULT_PROFILE), configured: false };
  }
  try {
    return { result: parseProfile(JSON.parse(raw)), configured: true };
  } catch {
    return { result: { ok: false, error: ['saved profile is not valid JSON'] }, configured: true };
  }
};

const loadProfile = async (): Promise<Result<DemoProfile, string[]>> =>
  (await loadProfileDetailed()).result;

const memoryStore = createFileMemoryStore();

/**
 * A mutable, persisted memory handle for one app, applying the pure core update
 * functions and saving after every write so the feature-map survives a crash.
 */
const buildAgentMemory = async (baseUrl: string): Promise<AgentMemory> => {
  let mem = await memoryStore.load(baseUrl);
  return {
    current: () => mem,
    remember: async (input) => {
      mem = rememberFeature(mem, input, new Date().toISOString());
      await memoryStore.save(mem);
    },
    note: async (summary, personaId) => {
      mem = recordInteraction(
        mem,
        personaId !== undefined ? { summary, personaId } : { summary },
        new Date().toISOString(),
      );
      await memoryStore.save(mem);
    },
  };
};

const saveProfile = async (input: unknown): Promise<Result<DemoProfile, string[]>> => {
  const parsed = parseProfile(input);
  if (!parsed.ok) return parsed;
  try {
    const path = getProfilePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(parsed.value, null, 2), 'utf8');
    return parsed;
  } catch (e) {
    return { ok: false, error: [`could not save settings: ${String(e)}`] };
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
  let browser: Browser | null = null;
  let driver: PlaywrightDriver | null = null;
  try {
    // Launch + driver creation are INSIDE the try so a launch failure (e.g. browsers
    // not installed) still hits the finally and releases the lock — otherwise the app
    // would be permanently stuck reporting "a run is already in progress".
    ({ browser } = await launchDemoBrowser());
    activeBrowser = browser;
    driver = createPlaywrightDriver({ browser, personas, baseUrl });
    return await body(driver, controller.signal);
  } catch (e) {
    return { ok: false, error: [`run failed: ${String(e)}`] };
  } finally {
    await driver?.close();
    await browser?.close().catch(() => undefined);
    activeBrowser = null;
    activeController = null;
    running = false;
  }
};

const registerIpc = (): void => {
  ipcMain.handle(IPC.getProfile, async () => {
    const { result, configured } = await loadProfileDetailed();
    return result.ok
      ? { ok: true, value: result.value, configured }
      : { ok: false, error: result.error, configured };
  });

  ipcMain.handle(IPC.saveProfile, async (_e, input: unknown) => {
    const result = await saveProfile(input);
    return result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error };
  });

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
    await applyStoredToken();
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

  // Chat: the first message starts a live session (own browser, kept open); later
  // messages continue it. The session drives the browser via the interactive agent.
  ipcMain.handle(IPC.chat, async (_e, text: string) => {
    if (activeSession) {
      activeSession.send(text);
      return { ok: true };
    }
    if (running) return { ok: false, error: ['a run is already in progress — stop it first'] };
    const profile = await loadProfile();
    if (!profile.ok) return { ok: false, error: profile.error };
    await applyStoredToken();
    running = true;
    try {
      const { personas, baseUrl } = profile.value;
      const now = new Date().toISOString();
      sessionState = {
        id: newConversationId(),
        startedAt: now,
        baseUrl,
        title: text.slice(0, 80),
        turns: [],
        personas,
        activity: new Map(),
        busy: true,
      };
      ({ browser: sessionBrowser } = await launchDemoBrowser());
      // If the operator closes the whole browser, the session can't continue — end it
      // cleanly with a clear message instead of leaving the agent driving dead windows.
      sessionBrowser.on('disconnected', () => {
        send(IPC.agentMessage, {
          kind: 'error',
          text: 'the browser was closed — session ended. send a message to start a new one.',
        });
        void endSession();
      });
      const driver = createPlaywrightDriver({ browser: sessionBrowser, personas, baseUrl });
      sessionDriver = driver;
      const memory = await buildAgentMemory(baseUrl);
      // Operator input typed into the in-page floating box feeds the same session.
      driver.onOperatorMessage((t) => activeSession?.send(t));
      activeSession = createInteractiveAgent({ driver, memory }).start({
        personas,
        baseUrl,
        firstMessage: text,
        // Fan every agent message out to the control window and the floating box, and
        // fold it into the saved transcript + tab-progress state.
        onMessage: (m) => {
          recordTurn(m);
          send(IPC.agentMessage, m);
          void driver.push(m);
        },
      });
      // Open the first persona window and show the floating box straight away.
      const first = personas[0];
      if (first) await driver.bringToFront(first.id).catch(() => undefined);
      await driver.setVisible(true).catch(() => undefined);
      // Poll per-tab progress for the GUI while the session is live.
      tabTimer = setInterval(() => void pushTabs(), 1200);
      return { ok: true };
    } catch (e) {
      await endSession();
      return { ok: false, error: [`could not start session: ${String(e)}`] };
    }
  });

  ipcMain.handle(IPC.interruptChat, async () => {
    await activeSession?.interrupt();
    await saveConversation();
  });

  ipcMain.handle(IPC.resumeChat, () => {
    activeSession?.resume();
  });

  ipcMain.handle(IPC.endChat, () => endSession());

  ipcMain.handle(IPC.getMemory, async (): Promise<AppMemory> => {
    const profile = await loadProfile();
    return memoryStore.load(profile.ok ? profile.value.baseUrl : DEFAULT_PROFILE.baseUrl);
  });

  ipcMain.handle(IPC.setInPageChat, async (_e, visible: boolean) => {
    await sessionDriver?.setVisible(visible === true).catch(() => undefined);
  });

  ipcMain.handle(IPC.listSessions, () => conversationStore.list());
  ipcMain.handle(IPC.getSession, (_e, id: string) => conversationStore.load(id));

  ipcMain.handle(IPC.getPreflight, () => runPreflight());

  ipcMain.handle(IPC.getAuthStatus, async () => ({ tokenSet: (await loadToken()) !== null }));
  ipcMain.handle(IPC.saveToken, async (_e, token: unknown) => {
    if (typeof token !== 'string' || token.trim() === '') {
      return { ok: false, error: ['token is empty'] };
    }
    await saveToken(token.trim());
    return { ok: true };
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
      // .mjs, not .js: Electron picks the preload's module system from the file
      // extension alone, so an ESM preload named .js is require()d and fails with
      // "require() of ES Module … not supported" — leaving window.ayd undefined and
      // the control UI silently dead. The source is preload.mts so tsc emits .mjs.
      preload: join(here, 'preload.mjs'),
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
  void endSession();
  if (process.platform !== 'darwin') app.quit();
});
