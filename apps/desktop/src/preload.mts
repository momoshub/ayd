import { contextBridge, ipcRenderer } from 'electron';
import type { RunEvent } from '@ayd/core';
import { IPC } from './ipc.js';

/** The safe API exposed to the renderer as window.ayd. */
export interface AydBridge {
  getProfile(): Promise<unknown>;
  runScript(scriptJson: string): Promise<unknown>;
  planAndRun(description: string): Promise<unknown>;
  stop(): Promise<void>;
  onEvent(cb: (event: RunEvent) => void): () => void;
}

const bridge: AydBridge = {
  getProfile: () => ipcRenderer.invoke(IPC.getProfile),
  runScript: (scriptJson) => ipcRenderer.invoke(IPC.runScript, scriptJson),
  planAndRun: (description) => ipcRenderer.invoke(IPC.planAndRun, description),
  stop: () => ipcRenderer.invoke(IPC.stop) as Promise<void>,
  onEvent: (cb) => {
    const listener = (_e: unknown, event: RunEvent): void => cb(event);
    ipcRenderer.on(IPC.event, listener);
    return () => ipcRenderer.off(IPC.event, listener);
  },
};

contextBridge.exposeInMainWorld('ayd', bridge);
