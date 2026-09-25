import type { RunEvent } from '@ayd/core';
import { describe, expect, it, vi } from 'vitest';
import { createIpcPresenter, IPC } from './ipc.js';

describe('createIpcPresenter', () => {
  it('forwards every run event on the IPC.event channel', () => {
    const send = vi.fn();
    const presenter = createIpcPresenter(send);
    const event: RunEvent = { type: 'run-started', scriptId: 's', totalSteps: 3 };
    presenter.emit(event);
    expect(send).toHaveBeenCalledWith(IPC.event, event);
  });
});
