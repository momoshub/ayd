import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentMessage,
  AppMemory,
  ConversationLog,
  ConversationSummary,
  RunEvent,
} from '@ayd/core';
import { IPC } from './ipc.js';

/** Per-tab progress payload streamed from main during a live session. */
export interface TabUpdate {
  tabs: { personaId: string; label: string; url: string; title: string }[];
  busy: boolean;
  activity: Record<string, string>;
}

/** Prerequisite check surfaced in the header. */
export interface PreflightStatus {
  browser: { name: string; ok: boolean };
  claudeCode: { ok: boolean; version?: string };
}

/** The safe API exposed to the renderer as window.ayd. */
export interface AydBridge {
  getProfile(): Promise<unknown>;
  /** Validate and persist the profile edited in Settings. */
  saveProfile(profile: unknown): Promise<unknown>;
  runScript(scriptJson: string): Promise<unknown>;
  planAndRun(description: string): Promise<unknown>;
  stop(): Promise<void>;
  onEvent(cb: (event: RunEvent) => void): () => void;
  /** Start a live session (first call) or send the next operator message. */
  chat(text: string): Promise<unknown>;
  /** Stop the current agent turn via code; the session stays open. */
  interruptChat(): Promise<void>;
  /** Resume the agent after a stop, via code (no operator prompt). */
  resumeChat(): Promise<void>;
  /** End the live session and close its browser. */
  endChat(): Promise<void>;
  onAgentMessage(cb: (message: AgentMessage) => void): () => void;
  onTabUpdate(cb: (update: TabUpdate) => void): () => void;
  /** Read the feature-map/memory for the current app. */
  getMemory(): Promise<AppMemory>;
  /** Show or hide the in-page floating chat box. */
  setInPageChat(visible: boolean): Promise<void>;
  /** List saved conversations, newest first. */
  listSessions(): Promise<readonly ConversationSummary[]>;
  /** Load one saved conversation transcript. */
  getSession(id: string): Promise<ConversationLog | null>;
  /** Whether a Claude Code token is stored. */
  getAuthStatus(): Promise<{ tokenSet: boolean }>;
  /** Save/update the Claude Code token (encrypted on this machine). */
  saveToken(token: string): Promise<unknown>;
  /** Check prerequisites: a Chromium-based browser and the Claude Code CLI. */
  getPreflight(): Promise<PreflightStatus>;
}

const bridge: AydBridge = {
  getProfile: () => ipcRenderer.invoke(IPC.getProfile),
  saveProfile: (profile) => ipcRenderer.invoke(IPC.saveProfile, profile),
  runScript: (scriptJson) => ipcRenderer.invoke(IPC.runScript, scriptJson),
  planAndRun: (description) => ipcRenderer.invoke(IPC.planAndRun, description),
  stop: () => ipcRenderer.invoke(IPC.stop) as Promise<void>,
  onEvent: (cb) => {
    const listener = (_e: unknown, event: RunEvent): void => cb(event);
    ipcRenderer.on(IPC.event, listener);
    return () => ipcRenderer.off(IPC.event, listener);
  },
  chat: (text) => ipcRenderer.invoke(IPC.chat, text),
  interruptChat: () => ipcRenderer.invoke(IPC.interruptChat) as Promise<void>,
  resumeChat: () => ipcRenderer.invoke(IPC.resumeChat) as Promise<void>,
  endChat: () => ipcRenderer.invoke(IPC.endChat) as Promise<void>,
  onAgentMessage: (cb) => {
    const listener = (_e: unknown, message: AgentMessage): void => cb(message);
    ipcRenderer.on(IPC.agentMessage, listener);
    return () => ipcRenderer.off(IPC.agentMessage, listener);
  },
  onTabUpdate: (cb) => {
    const listener = (_e: unknown, update: TabUpdate): void => cb(update);
    ipcRenderer.on(IPC.tabUpdate, listener);
    return () => ipcRenderer.off(IPC.tabUpdate, listener);
  },
  getMemory: () => ipcRenderer.invoke(IPC.getMemory) as Promise<AppMemory>,
  setInPageChat: (visible) => ipcRenderer.invoke(IPC.setInPageChat, visible) as Promise<void>,
  listSessions: () =>
    ipcRenderer.invoke(IPC.listSessions) as Promise<readonly ConversationSummary[]>,
  getSession: (id) => ipcRenderer.invoke(IPC.getSession, id) as Promise<ConversationLog | null>,
  getAuthStatus: () => ipcRenderer.invoke(IPC.getAuthStatus) as Promise<{ tokenSet: boolean }>,
  saveToken: (token) => ipcRenderer.invoke(IPC.saveToken, token),
  getPreflight: () => ipcRenderer.invoke(IPC.getPreflight) as Promise<PreflightStatus>,
};

contextBridge.exposeInMainWorld('ayd', bridge);
