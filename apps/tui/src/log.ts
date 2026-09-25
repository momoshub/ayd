import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { dataDir } from './paths.js';

/**
 * A tiny append-only file logger, so the TUI is debuggable: a terminal app can't
 * scroll a console, and most errors are otherwise swallowed. Everything of note
 * (lifecycle, tool actions, and every caught error with its stack) lands in one
 * timestamped file. Tail it with `tail -f "$(ayd prints the path)"`.
 *
 * Path: AYD_LOG, else <data dir>/ayd.log. DEBUG lines only when AYD_DEBUG is set.
 */
export const logPath = (): string => process.env['AYD_LOG'] ?? join(dataDir(), 'ayd.log');

let dirReady = false;

const stringify = (v: unknown): string => {
  if (v instanceof Error) return v.stack ?? v.message;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const write = (level: string, msg: string, extra?: unknown): void => {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${msg}${extra !== undefined ? ` ${stringify(extra)}` : ''}\n`;
  const flush = async (): Promise<void> => {
    if (!dirReady) {
      await mkdir(dirname(logPath()), { recursive: true }).catch(() => undefined);
      dirReady = true;
    }
    await appendFile(logPath(), line).catch(() => undefined);
  };
  void flush();
};

export const log = {
  path: logPath,
  info: (msg: string, extra?: unknown): void => write('INFO', msg, extra),
  warn: (msg: string, extra?: unknown): void => write('WARN', msg, extra),
  error: (msg: string, extra?: unknown): void => write('ERROR', msg, extra),
  debug: (msg: string, extra?: unknown): void => {
    if (process.env['AYD_DEBUG']) write('DEBUG', msg, extra);
  },
};
