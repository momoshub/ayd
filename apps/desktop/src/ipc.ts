import type { Presenter, RunEvent } from '@ayd/core';

/** IPC channels between the Electron main process and the control-UI renderer. */
export const IPC = {
  /** renderer → main: run a raw DemoScript JSON string. */
  runScript: 'ayd:run-script',
  /** renderer → main: plan from a description, then run. */
  planAndRun: 'ayd:plan-and-run',
  /** renderer → main: stop the current run and close browser windows. */
  stop: 'ayd:stop',
  /** renderer → main: read the demo profile (personas, base URL). */
  getProfile: 'ayd:get-profile',
  /** renderer → main: validate and persist the demo profile from Settings. */
  saveProfile: 'ayd:save-profile',
  /** main → renderer: a streamed RunEvent. */
  event: 'ayd:event',
  /** renderer → main: start (or continue) a live chat session driving the browser. */
  chat: 'ayd:chat',
  /** renderer → main: interrupt the current agent turn (session stays open). */
  interruptChat: 'ayd:interrupt-chat',
  /** renderer → main: end the live chat session and close its browser. */
  endChat: 'ayd:end-chat',
  /** main → renderer: a streamed AgentMessage from the live session. */
  agentMessage: 'ayd:agent-message',
  /** renderer → main: read the feature-map/memory for the current app. */
  getMemory: 'ayd:get-memory',
  /** renderer → main: show or hide the in-page floating chat box. */
  setInPageChat: 'ayd:set-in-page-chat',
  /** renderer → main: resume the agent after a stop, via code (no prompt). */
  resumeChat: 'ayd:resume-chat',
  /** main → renderer: per-tab progress for the open persona windows. */
  tabUpdate: 'ayd:tab-update',
  /** renderer → main: list saved conversations. */
  listSessions: 'ayd:list-sessions',
  /** renderer → main: load one saved conversation transcript. */
  getSession: 'ayd:get-session',
  /** renderer → main: save/update the Claude Code token (encrypted). */
  saveToken: 'ayd:save-token',
  /** renderer → main: whether a Claude Code token is stored. */
  getAuthStatus: 'ayd:get-auth-status',
} as const;

/** Presenter that forwards run events to a renderer over `send(IPC.event, ...)`. */
export const createIpcPresenter = (
  send: (channel: string, payload: RunEvent) => void,
): Presenter => ({
  emit: (event) => send(IPC.event, event),
});
