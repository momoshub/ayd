import type { RunEvent } from '@ayd/core';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const log = (line: string): void => {
  const pre = $<HTMLPreElement>('log');
  pre.textContent += line + '\n';
  pre.scrollTop = pre.scrollHeight;
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

const main = async (): Promise<void> => {
  window.ayd.onEvent(renderEvent);

  const profile = (await window.ayd.getProfile()) as {
    ok: boolean;
    value?: { baseUrl: string };
    error?: string[];
  };
  $<HTMLDivElement>('profile').textContent = profile.ok
    ? `profile: ${profile.value?.baseUrl ?? ''}`
    : `no profile — ${(profile.error ?? []).join('; ')}`;

  $<HTMLButtonElement>('run').addEventListener('click', () => {
    log('— run script —');
    void window.ayd.runScript($<HTMLTextAreaElement>('script').value);
  });
  $<HTMLButtonElement>('plan').addEventListener('click', () => {
    log('— plan & run —');
    void window.ayd.planAndRun($<HTMLTextAreaElement>('description').value);
  });
  $<HTMLButtonElement>('stop').addEventListener('click', () => {
    log('— stop —');
    void window.ayd.stop();
  });
};

void main();
