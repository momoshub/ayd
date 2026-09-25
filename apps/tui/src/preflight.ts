import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { detectBrowser } from '@ayd/engine';

const run = promisify(execFile);

/** What the app needs on this machine to actually run a live/plan demo. */
export interface Preflight {
  readonly browser: { readonly name: string; readonly ok: boolean };
  readonly claudeCode: { readonly ok: boolean; readonly version?: string };
}

// A shell inherits a minimal PATH in some launch contexts, so look for the Claude
// Code CLI in the usual install spots before trusting PATH.
const claudeCandidates = (): readonly string[] => {
  const home = homedir();
  return [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    `${home}/.claude/local/claude`,
    `${home}/.local/bin/claude`,
    'C:\\Program Files\\Claude\\claude.exe',
  ];
};

const versionOf = async (bin: string): Promise<string | undefined> => {
  try {
    const { stdout } = await run(bin, ['--version'], { timeout: 4000 });
    return stdout.trim();
  } catch {
    return undefined;
  }
};

const checkClaude = async (): Promise<{ ok: boolean; version?: string }> => {
  const found = claudeCandidates().find((p) => existsSync(p));
  const version = found !== undefined ? await versionOf(found) : await versionOf('claude');
  return version !== undefined ? { ok: true, version } : { ok: false };
};

/** Report whether a Chromium-based browser and the Claude Code CLI are present. */
export const runPreflight = async (): Promise<Preflight> => {
  const b = detectBrowser();
  const claudeCode = await checkClaude();
  return {
    browser: { name: b.name, ok: b.executablePath !== undefined },
    claudeCode,
  };
};
