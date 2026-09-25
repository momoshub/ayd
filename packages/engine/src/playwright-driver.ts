import type {
  AgentMessage,
  BrowserDriver,
  InPageChat,
  PageObservation,
  PageObserver,
  Persona,
  Selector,
  TabInfo,
  TabReporter,
} from '@ayd/core';
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

export interface PlaywrightDriver extends BrowserDriver, PageObserver, InPageChat, TabReporter {
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
  const personaById = new Map(config.personas.map((p) => [p.id, p]));
  const sessions = new Map<string, Session>();
  // Set by the desktop before the agent runs; the in-page box calls this on send.
  // Read at call time (a `let`) so it can be registered after contexts are created.
  let operatorHandler: ((text: string) => void) | undefined;
  let chatVisible = false;

  const persona = (personaId: string): Persona => {
    const p = personaById.get(personaId);
    if (!p) throw new Error(`unknown persona: ${personaId}`);
    return p;
  };

  const ensureSession = async (personaId: string): Promise<Session> => {
    const existing = sessions.get(personaId);
    // A closed window/tab leaves a dead page behind. Drop it and reopen so the
    // operator can carry on, instead of every action failing with "page closed".
    if (existing && !existing.page.isClosed()) return existing;
    if (existing) sessions.delete(personaId);
    const context = await config.browser.newContext({ viewport: null });
    // exposeBinding before addInitScript so window.__aydChatSend exists when the
    // overlay wires the in-page box on load.
    await context.exposeBinding('__aydChatSend', (_source, text: unknown) => {
      operatorHandler?.(String(text));
    });
    await context.addInitScript(OVERLAY_RUNTIME);
    const page = await context.newPage();
    const session: Session = { context, page };
    sessions.set(personaId, session);
    await paintFrame(session, persona(personaId));
    if (chatVisible) await showChat(session).catch(() => undefined);
    return session;
  };

  const showChat = (session: Session): Promise<void> =>
    session.page
      .evaluate(() => window.__ayd?.chat?.setVisible(true))
      .then(() => undefined)
      .catch(() => undefined);

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

  // Glide the on-screen AI pointer to the element's centre and return the point.
  // Visual only (a free-moving overlay, not the real OS mouse); the actual
  // interaction is done by the caller via a verified Locator action.
  const glideTo = async (page: Page, locator: Locator): Promise<[number, number] | null> => {
    await locator.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined);
    const box = await locator.boundingBox().catch(() => null);
    if (!box) return null;
    const point = boxCenter(box);
    await page.evaluate(([x, y]) => window.__ayd?.moveCursor(x, y), point).catch(() => undefined);
    // Let the pointer visibly travel to the target before the action fires.
    await page.waitForTimeout(420);
    return point;
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
      // Give slow apps (SPA logins, redirects) time to settle so a long load is not
      // mistaken for a finished page. Bounded so a long-polling app doesn't hang here.
      await session.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
      await paintFrame(session, persona(personaId));
    },

    async click(personaId, target) {
      const session = await ensureSession(personaId);
      const locator = resolveLocator(session.page, target);
      const point = await glideTo(session.page, locator); // AI pointer travels to the target
      // A verified click (waits for actionability); it throws if the element isn't
      // clickable, so runScript records a real failure instead of a false success.
      await locator.click({ timeout: 4000 });
      // Ripple at the AI pointer, since it no longer rides the real mouse's mousedown.
      if (point)
        await session.page
          .evaluate(([x, y]) => window.__ayd?.ripple(x, y), point)
          .catch(() => undefined);
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

    async observe(personaId): Promise<PageObservation> {
      const session = await ensureSession(personaId);
      return session.page
        .evaluate(() => {
          const clean = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          const uniq = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
          const headings = uniq(
            Array.from(document.querySelectorAll('h1,h2,h3'), (el) => clean(el).slice(0, 100)),
          ).slice(0, 30);
          const links = Array.from(document.querySelectorAll('a[href]'), (a) => ({
            text: clean(a).slice(0, 80),
            href: a.getAttribute('href') ?? '',
          }))
            .filter((l) => l.text !== '')
            .slice(0, 50);
          const controls = uniq(
            Array.from(
              document.querySelectorAll(
                'button,[role="button"],[role="menuitem"],[role="tab"],input,select,textarea',
              ),
              (el) =>
                (
                  clean(el) ||
                  el.getAttribute('aria-label') ||
                  el.getAttribute('placeholder') ||
                  el.getAttribute('name') ||
                  ''
                ).slice(0, 60),
            ),
          ).slice(0, 60);
          const loading =
            document.readyState !== 'complete' ||
            document.querySelector(
              '[aria-busy="true"],[role="progressbar"],.loading,.spinner,.ant-spin-spinning',
            ) !== null;
          return {
            url: location.href,
            title: document.title,
            headings,
            links,
            controls,
            readyState: document.readyState,
            loading,
          };
        })
        .catch(() => ({ url: '', title: '', headings: [], links: [], controls: [] }));
    },

    onOperatorMessage(cb) {
      operatorHandler = cb;
    },

    async push(message: AgentMessage) {
      // Flatten to a plain, serializable shape the injected box understands.
      const payload = {
        kind: message.kind,
        ...('text' in message && message.text !== undefined ? { text: message.text } : {}),
        ...('tool' in message ? { tool: message.tool } : {}),
        ...('detail' in message && message.detail !== undefined ? { detail: message.detail } : {}),
      };
      await Promise.all(
        [...sessions.values()].map((session) =>
          session.page.evaluate((m) => window.__ayd?.chat?.push(m), payload).catch(() => undefined),
        ),
      );
    },

    async setVisible(visible) {
      chatVisible = visible;
      await Promise.all(
        [...sessions.values()].map((session) =>
          session.page
            .evaluate((v) => window.__ayd?.chat?.setVisible(v), visible)
            .catch(() => undefined),
        ),
      );
    },

    async listTabs(): Promise<readonly TabInfo[]> {
      return Promise.all(
        [...sessions.entries()].map(async ([personaId, session]) => ({
          personaId,
          label: persona(personaId).label,
          url: session.page.url(),
          title: await session.page.title().catch(() => ''),
        })),
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
