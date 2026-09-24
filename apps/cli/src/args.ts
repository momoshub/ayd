import { type Result, err, ok } from '@ayd/core';

export interface CliArgs {
  readonly scriptPath: string;
  readonly headed: boolean;
  readonly baseUrl?: string;
  readonly paceMs: number;
}

const USAGE = 'usage: ayd <script.json> [--headed|--headless] [--base-url=URL] [--pace=ms]';

/** Parse argv (already sliced past node + script). Pure and unit-tested. */
export const parseArgs = (argv: readonly string[]): Result<CliArgs, string> => {
  let scriptPath: string | undefined;
  let headed = true;
  let baseUrl: string | undefined;
  let paceMs: number | undefined;

  for (const arg of argv) {
    if (arg === '--headed') headed = true;
    else if (arg === '--headless') headed = false;
    else if (arg.startsWith('--base-url=')) baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--pace=')) {
      const n = Number(arg.slice('--pace='.length));
      if (!Number.isFinite(n) || n < 0) return err(`invalid --pace value: ${arg}`);
      paceMs = n;
    } else if (arg.startsWith('--')) return err(`unknown flag: ${arg}\n${USAGE}`);
    else if (scriptPath === undefined) scriptPath = arg;
    else return err(`unexpected argument: ${arg}\n${USAGE}`);
  }

  if (scriptPath === undefined) return err(USAGE);
  return ok({
    scriptPath,
    headed,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    paceMs: paceMs ?? (headed ? 1200 : 0),
  });
};
