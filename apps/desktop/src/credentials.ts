import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';

/**
 * The Claude Code token used to authenticate the AI. It is SENSITIVE, so it is kept
 * out of the profile and encrypted at rest with the OS keychain (Electron
 * safeStorage) under the user-data dir. It is never returned to the renderer or
 * logged — only a boolean "is one set" is exposed.
 */

const tokenFile = (): string => join(app.getPath('userData'), 'credentials.bin');

export const saveToken = async (token: string): Promise<void> => {
  const path = tokenFile();
  await mkdir(dirname(path), { recursive: true });
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(token)
    : Buffer.from(token, 'utf8');
  await writeFile(path, data);
};

export const loadToken = async (): Promise<string | null> => {
  try {
    const data = await readFile(tokenFile());
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(data)
      : data.toString('utf8');
  } catch {
    return null;
  }
};

export const clearToken = async (): Promise<void> => {
  await rm(tokenFile()).catch(() => undefined);
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
