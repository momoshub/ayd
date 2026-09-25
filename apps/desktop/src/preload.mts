import { contextBridge, ipcRenderer } from 'electron';
import type { AgentMessage, RunEvent } from '@ayd/core';
import { IPC } from './ipc.js';

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
  /** Interrupt the current agent turn; the session stays open for a follow-up. */
  interruptChat(): Promise<void>;
  /** End the live session and close its browser. */
  endChat(): Promise<void>;
  onAgentMessage(cb: (message: AgentMessage) => void): () => void;
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
  endChat: () => ipcRenderer.invoke(IPC.endChat) as Promise<void>,
  onAgentMessage: (cb) => {
    const listener = (_e: unknown, message: AgentMessage): void => cb(message);
    ipcRenderer.on(IPC.agentMessage, listener);
    return () => ipcRenderer.off(IPC.agentMessage, listener);
  },
};

contextBridge.exposeInMainWorld('ayd', bridge);
