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
} as const;

/** Presenter that forwards run events to a renderer over `send(IPC.event, ...)`. */
export const createIpcPresenter = (
  send: (channel: string, payload: RunEvent) => void,
): Presenter => ({
  emit: (event) => send(IPC.event, event),
});
