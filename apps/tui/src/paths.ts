import { homedir } from 'node:os';
import { join } from 'node:path';

/** Machine-local data dir for sessions + memory (no Electron user-data dir here). */
export const dataDir = (): string =>
  process.env['AYD_DATA_DIR'] ?? join(homedir(), '.config', 'ayd');
