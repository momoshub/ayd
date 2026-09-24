import type { BrowserDriver, Persona, Selector } from '@ayd/core';
import type { Browser, BrowserContext, Locator, Page } from 'playwright';
import { toLocatorCall } from './locator.js';
import { captionAnchor, OVERLAY_RUNTIME } from './overlays.js';

export interface PlaywrightDriverConfig {
  readonly browser: Browser;
  readonly personas: readonly Persona[];
  /** Prepended to every navigate() path. */
  readonly baseUrl: string;
  /** Mouse-glide smoothness for the on-screen pointer. */
  readonly pointerSteps?: number;
}

export interface PlaywrightDriver extends BrowserDriver {
  close(): Promise<void>;
}

interface Session {
  readonly context: BrowserContext;
  readonly page: Page;
}

const boxCenter = (box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): [number, number] => [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)];

/**
 * Drives one isolated browser session per persona (separate cookie jars, so an
 * admin and a scoped user stay logged in at once) and paints the demo overlays.
 * Everything here is thin glue over Playwright; the decisions are in locator.ts
 * and overlays.ts.
 */
export const createPlaywrightDriver = (config: PlaywrightDriverConfig): PlaywrightDriver => {
  const pointerSteps = config.pointerSteps ?? 24;
  const personaById = new Map(config.personas.map((p) => [p.id, p]));
  const sessions = new Map<string, Session>();

  const persona = (personaId: string): Persona => {
    const p = personaById.get(personaId);
    if (!p) throw new Error(`unknown persona: ${personaId}`);
    return p;
  };

  const ensureSession = async (personaId: string): Promise<Session> => {
    const existing = sessions.get(personaId);
    if (existing) return existing;
    const context = await config.browser.newContext({ viewport: null });
    await context.addInitScript(OVERLAY_RUNTIME);
    const page = await context.newPage();
    const session: Session = { context, page };
    sessions.set(personaId, session);
    await paintFrame(session, persona(personaId));
    return session;
  };

  const paintFrame = async (session: Session, p: Persona): Promise<void> => {
    await session.page
      .evaluate(([color, label]) => window.__ayd?.frame(color, label), [p.color, p.label] as const)
      .catch(() => undefined);
  };

  const resolveLocator = (page: Page, selector: Selector): Locator => {
    const call = toLocatorCall(selector);
    switch (call.method) {
      case 'getByRole':
        return page.getByRole(call.role as Parameters<Page['getByRole']>[0], {
          ...(call.name !== undefined ? { name: call.name } : {}),
          ...(call.exact !== undefined ? { exact: call.exact } : {}),
        });
      case 'getByText':
        return page.getByText(call.text);
      case 'getByTestId':
        return page.getByTestId(call.testId);
      case 'getByLabel':
        return page.getByLabel(call.label);
      case 'locator':
        return page.locator(call.css);
    }
  };

  const glideTo = async (page: Page, locator: Locator): Promise<[number, number] | null> => {
    await locator.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
    const box = await locator.boundingBox().catch(() => null);
    if (!box) return null;
    const [x, y] = boxCenter(box);
    await page.mouse.move(x, y, { steps: pointerSteps });
    return [x, y];
  };

  return {
    async bringToFront(personaId) {
      const session = await ensureSession(personaId);
      await session.page.bringToFront();
      await paintFrame(session, persona(personaId));
    },

    async navigate(personaId, path) {
      const session = await ensureSession(personaId);
      // an already-absolute URL (http:, file:, data:, …) is used as-is; a bare
      // path is resolved against baseUrl.
      const url = /^[a-z][a-z0-9+.-]*:/i.test(path) ? path : `${config.baseUrl}${path}`;
      await session.page
        .goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        .catch(() => undefined);
      await paintFrame(session, persona(personaId));
    },

    async click(personaId, target) {
      const session = await ensureSession(personaId);
      const locator = resolveLocator(session.page, target);
      const point = await glideTo(session.page, locator);
      if (point) await session.page.mouse.click(point[0], point[1]);
      else await locator.click({ timeout: 4000 }).catch(() => undefined);
    },

    async type(personaId, target, text, opts) {
      const session = await ensureSession(personaId);
      const locator = resolveLocator(session.page, target);
      await glideTo(session.page, locator);
      await locator.fill(text, { timeout: 4000 });
      if (opts?.submit === true) await locator.press('Enter').catch(() => undefined);
    },

    async highlight(personaId, target, label) {
      const session = await ensureSession(personaId);
      const locator = resolveLocator(session.page, target);
      await glideTo(session.page, locator);
      const box = await locator.boundingBox().catch(() => null);
      if (!box) return;
      const viewport = session.page.viewportSize();
      const anchor = captionAnchor(box.y, box.height, viewport?.height ?? 900);
      await session.page
        .evaluate(
          ([b, l, a]) => {
            window.__ayd?.highlight(b, l);
            const cap = document.getElementById('__ayd_cap');
            if (cap instanceof HTMLElement) {
              cap.style.top = a === 'top' ? '28px' : 'auto';
              cap.style.bottom = a === 'top' ? 'auto' : '38px';
            }
          },
          [
            { x: box.x, y: box.y, width: box.width, height: box.height },
            label ?? '',
            anchor,
          ] as const,
        )
        .catch(() => undefined);
    },

    async waitFor(personaId, target, state, timeoutMs) {
      const session = await ensureSession(personaId);
      const locator = resolveLocator(session.page, target);
      return locator
        .waitFor({ state, timeout: timeoutMs })
        .then(() => true)
        .catch(() => false);
    },

    async isVisible(personaId, target) {
      const session = await ensureSession(personaId);
      return resolveLocator(session.page, target)
        .isVisible()
        .catch(() => false);
    },

    async caption(text, sub) {
      await Promise.all(
        [...sessions.values()].map((session) =>
          session.page
            .evaluate(([t, s]) => window.__ayd?.caption(t, s, 'bottom'), [text, sub ?? ''] as const)
            .catch(() => undefined),
        ),
      );
    },

    async close() {
      await Promise.all(
        [...sessions.values()].map((s) => s.context.close().catch(() => undefined)),
      );
      sessions.clear();
    },
  };
};
