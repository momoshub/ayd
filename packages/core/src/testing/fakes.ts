import { describeSelector, type Selector } from '../domain/selector.js';
import type { BrowserDriver } from '../ports/browser-driver.js';
import type { Clock } from '../ports/clock.js';
import type { Presenter, RunEvent } from '../ports/presenter.js';

/** One recorded call against the fake driver. */
export interface DriverCall {
  readonly method: keyof BrowserDriver;
  readonly personaId?: string;
  readonly detail?: string;
}

export interface FakeDriver {
  readonly driver: BrowserDriver;
  readonly calls: DriverCall[];
  /** Make `isVisible`/`waitFor` report this selector as visible. */
  setVisible(target: Selector, visible: boolean): void;
  /** Make the next call to `method` throw. */
  failOn(method: keyof BrowserDriver, reason?: string): void;
}

export const createFakeDriver = (): FakeDriver => {
  const calls: DriverCall[] = [];
  const visible = new Map<string, boolean>();
  const failures = new Map<keyof BrowserDriver, string>();

  const guard = (method: keyof BrowserDriver): void => {
    const reason = failures.get(method);
    if (reason !== undefined) {
      failures.delete(method);
      throw new Error(reason);
    }
  };

  const driver: BrowserDriver = {
    bringToFront: async (personaId) => {
      guard('bringToFront');
      calls.push({ method: 'bringToFront', personaId });
    },
    navigate: async (personaId, path) => {
      guard('navigate');
      calls.push({ method: 'navigate', personaId, detail: path });
    },
    click: async (personaId, target) => {
      guard('click');
      calls.push({ method: 'click', personaId, detail: describeSelector(target) });
    },
    type: async (personaId, target, text) => {
      guard('type');
      calls.push({ method: 'type', personaId, detail: `${describeSelector(target)}=${text}` });
    },
    highlight: async (personaId, target) => {
      guard('highlight');
      calls.push({ method: 'highlight', personaId, detail: describeSelector(target) });
    },
    waitFor: async (personaId, target) => {
      guard('waitFor');
      calls.push({ method: 'waitFor', personaId, detail: describeSelector(target) });
      return visible.get(describeSelector(target)) ?? true;
    },
    isVisible: async (personaId, target) => {
      guard('isVisible');
      calls.push({ method: 'isVisible', personaId, detail: describeSelector(target) });
      return visible.get(describeSelector(target)) ?? false;
    },
    caption: async (text) => {
      guard('caption');
      calls.push({ method: 'caption', detail: text });
    },
  };

  return {
    driver,
    calls,
    setVisible: (target, v) => visible.set(describeSelector(target), v),
    failOn: (method, reason = `fake failure in ${method}`) => failures.set(method, reason),
  };
};

export interface RecordingPresenter {
  readonly presenter: Presenter;
  readonly events: RunEvent[];
}

export const createRecordingPresenter = (): RecordingPresenter => {
  const events: RunEvent[] = [];
  return { presenter: { emit: (e) => events.push(e) }, events };
};

/** A clock that never actually waits; records requested sleeps for assertions. */
export const createImmediateClock = (): Clock & { readonly sleeps: number[] } => {
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
};
