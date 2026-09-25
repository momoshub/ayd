import { spawn } from 'node:child_process';

/**
 * The Claude Code token used to authenticate the AI, kept encrypted at rest in the
 * OS keychain — the same store Electron's safeStorage used under the hood — via the
 * macOS `security` CLI, so there is no native dependency and it works under Bun.
 * The token is never logged; only "is one set" is surfaced.
 *
 * On non-macOS platforms there is no keychain here, so token storage is unavailable
 * and the AI falls back to the user's `claude login` OAuth session.
 */

const SERVICE = 'ayd';
const ACCOUNT = 'claude-token';
const isMac = process.platform === 'darwin';

export const keychainAvailable = (): boolean => isMac;

const run = (args: readonly string[]): Promise<{ code: number; out: string }> =>
  new Promise((resolve) => {
    const p = spawn('security', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.on('close', (code) => resolve({ code: code ?? 1, out }));
    p.on('error', () => resolve({ code: 1, out: '' }));
  });

export const saveToken = async (token: string): Promise<boolean> => {
  if (!isMac) return false;
  // -U updates an existing item; -w sets the value.
  const { code } = await run([
    'add-generic-password',
    '-U',
    '-a',
    ACCOUNT,
    '-s',
    SERVICE,
    '-w',
    token,
  ]);
  return code === 0;
};

export const loadToken = async (): Promise<string | null> => {
  if (!isMac) return null;
  const { code, out } = await run(['find-generic-password', '-a', ACCOUNT, '-s', SERVICE, '-w']);
  return code === 0 && out.trim() !== '' ? out.trim() : null;
};

export const clearToken = async (): Promise<boolean> => {
  if (!isMac) return false;
  const { code } = await run(['delete-generic-password', '-a', ACCOUNT, '-s', SERVICE]);
  return code === 0;
};

/**
 * Put the stored token into the environment the Claude Agent SDK reads, so the AI
 * authenticates without a `claude login`. An API key (sk-ant…) goes to
 * ANTHROPIC_API_KEY; anything else is treated as a Claude Code OAuth token.
 */
export const applyStoredToken = async (): Promise<void> => {
  const token = await loadToken();
  if (token === null || token.trim() === '') return;
  if (token.startsWith('sk-ant')) process.env['ANTHROPIC_API_KEY'] = token;
  else process.env['CLAUDE_CODE_OAUTH_TOKEN'] = token;
};
