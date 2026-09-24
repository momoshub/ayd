import type { RunEvent } from '@ayd/core';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const log = (line: string): void => {
  const box = $<HTMLElement>('log');
  const el = document.createElement('div');
  el.className = 'line';
  const glyph = line.trim()[0] ?? '';
  if (glyph === '✓') el.classList.add('ok');
  else if (glyph === '✗' || glyph === '!') el.classList.add('err');
  else if (glyph === '▶' || glyph === '■') el.classList.add('hdr');
  el.textContent = line;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
};

const renderEvent = (e: RunEvent): void => {
  switch (e.type) {
    case 'run-started':
      log(`▶ run started — ${String(e.totalSteps)} steps`);
      break;
    case 'step-started':
      log(`  · [${String(e.index)}] ${e.step.action}`);
      break;
    case 'step-succeeded':
      log(`  ✓ [${String(e.index)}] ${e.step.action}`);
      break;
    case 'step-failed':
      log(`  ✗ [${String(e.index)}] ${e.step.action} — ${e.reason}`);
      break;
    case 'run-finished':
      log(
        `■ done — ${String(e.report.succeeded)}/${String(e.report.total)} ok, ${String(e.report.failed)} failed`,
      );
      break;
  }
};

/** Report an IPC result that came back `{ ok: false, error }` instead of dropping it. */
const reportResult = (label: string, result: unknown): void => {
  if (typeof result === 'object' && result !== null && 'ok' in result && result.ok === false) {
    const error = (result as { error?: readonly string[] }).error ?? ['unknown error'];
    log(`  ✗ ${label} — ${error.join('; ')}`);
  }
};

const main = async (): Promise<void> => {
  // A missing/failed preload leaves window.ayd undefined. Say so loudly — the old
  // code dereferenced it on the first line and died, leaving a UI whose buttons
  // looked fine and did nothing.
  if (window.ayd === undefined) {
    log('! preload did not load — window.ayd is undefined, so the controls are dead');
    log('  (check the preload path in main.ts: an ESM preload must be named .mjs)');
    return;
  }

  // Wire the controls before any await: a later rejection must never leave the
  // UI inert and silent.
  $<HTMLButtonElement>('run').addEventListener('click', () => {
    log('— run script —');
    void window.ayd
      .runScript($<HTMLTextAreaElement>('script').value)
      .then((r) => reportResult('run script', r))
      .catch((e: unknown) => log(`  ✗ run script — ${String(e)}`));
  });
  $<HTMLButtonElement>('plan').addEventListener('click', () => {
    log('— plan & run —');
    void window.ayd
      .planAndRun($<HTMLTextAreaElement>('description').value)
      .then((r) => reportResult('plan & run', r))
      .catch((e: unknown) => log(`  ✗ plan & run — ${String(e)}`));
  });
  $<HTMLButtonElement>('stop').addEventListener('click', () => {
    log('— stop —');
    void window.ayd.stop().catch((e: unknown) => log(`  ✗ stop — ${String(e)}`));
  });

  window.ayd.onEvent(renderEvent);

  const profile = (await window.ayd.getProfile()) as {
    ok: boolean;
    value?: { baseUrl: string };
    error?: string[];
  };
  $<HTMLDivElement>('profile').textContent = profile.ok
    ? `profile: ${profile.value?.baseUrl ?? ''}`
    : `no profile — ${(profile.error ?? []).join('; ')}`;
};

void main().catch((e: unknown) => log(`! control UI failed — ${String(e)}`));
