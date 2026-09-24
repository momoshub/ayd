import type { AgentMessage, RunEvent } from '@ayd/core';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

// ---- run log (scripted runs) ----------------------------------------------

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

// ---- live chat transcript --------------------------------------------------

const transcript = (): HTMLElement => $<HTMLElement>('transcript');

const bubble = (kind: 'you' | 'agent' | 'err', text: string): void => {
  const el = document.createElement('div');
  el.className = `msg ${kind}`;
  el.textContent = text;
  const box = transcript();
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
};

const actionChip = (tool: string, detail?: string): void => {
  const el = document.createElement('div');
  el.className = 'action';
  const t = document.createElement('span');
  t.className = 'tool';
  t.textContent = tool;
  el.append('› ', t);
  if (detail !== undefined) el.append(` ${detail}`);
  const box = transcript();
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
};

const statusLine = (text: string, divider = false): void => {
  const el = document.createElement('div');
  el.className = divider ? 'status divider' : 'status';
  el.textContent = text;
  const box = transcript();
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
};

/** Session lifecycle, reflected in the composer buttons + profile pill. */
let sessionActive = false;

const setSession = (active: boolean): void => {
  sessionActive = active;
  $<HTMLButtonElement>('continue').disabled = !active;
  $<HTMLButtonElement>('interrupt').disabled = !active;
  $<HTMLButtonElement>('end').disabled = !active;
  $<HTMLElement>('profile').classList.toggle('live', active);
  $<HTMLElement>('chat-hint').textContent = active
    ? 'live — the agent is driving the browser'
    : 'idle — send a message to open the browser';
};

const renderAgentMessage = (m: AgentMessage): void => {
  switch (m.kind) {
    case 'assistant':
      bubble('agent', m.text);
      break;
    case 'action':
      actionChip(m.tool, m.detail);
      break;
    case 'error':
      bubble('err', m.text);
      break;
    case 'status':
      // The operator echo ("you: …") is already shown as a bubble on send.
      if (m.text.startsWith('you: ')) break;
      if (m.text === 'session started') setSession(true);
      else if (m.text === 'session ended') setSession(false);
      statusLine(m.text);
      break;
    case 'done':
      statusLine('turn complete — send the next step', true);
      break;
  }
};

// ---- wiring ----------------------------------------------------------------

const sendChat = (text: string): void => {
  const trimmed = text.trim();
  if (trimmed === '') return;
  bubble('you', trimmed);
  void window.ayd.chat(trimmed).then((r) => {
    if (typeof r === 'object' && r !== null && 'ok' in r && r.ok === false) {
      const err = (r as { error?: readonly string[] }).error ?? ['unknown error'];
      bubble('err', err.join('; '));
    }
  });
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

  // --- chat controls (the live agent) ---
  const input = $<HTMLTextAreaElement>('chat-input');
  $<HTMLButtonElement>('send').addEventListener('click', () => {
    sendChat(input.value);
    input.value = '';
    input.focus();
  });
  // Enter sends, Shift+Enter inserts a newline — the interactive-cursor flow.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat(input.value);
      input.value = '';
    }
  });
  $<HTMLButtonElement>('continue').addEventListener('click', () => {
    if (sessionActive) sendChat('continue');
    input.focus();
  });
  $<HTMLButtonElement>('interrupt').addEventListener('click', () => {
    void window.ayd.interruptChat().catch((e: unknown) => bubble('err', String(e)));
  });
  $<HTMLButtonElement>('end').addEventListener('click', () => {
    void window.ayd.endChat().catch((e: unknown) => bubble('err', String(e)));
    setSession(false);
  });
  window.ayd.onAgentMessage(renderAgentMessage);

  // --- scripted controls ---
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

  input.focus();
};

void main().catch((e: unknown) => log(`! control UI failed — ${String(e)}`));
