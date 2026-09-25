import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConversationLog, ConversationStore, ConversationSummary } from '@ayd/core';
import { app } from 'electron';

/**
 * File-backed conversation history: one JSON transcript per session under the
 * user-data dir, so past conversations can be reopened. Ids are timestamp-based and
 * filesystem-safe.
 */

const dir = (): string => join(app.getPath('userData'), 'sessions');

const isLog = (v: unknown): v is ConversationLog =>
  typeof v === 'object' && v !== null && Array.isArray((v as ConversationLog).turns);

export const newConversationId = (): string => new Date().toISOString().replace(/[:.]/g, '-');

export const createFileConversationStore = (): ConversationStore => ({
  async list(): Promise<readonly ConversationSummary[]> {
    let files: string[];
    try {
      files = (await readdir(dir())).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const logs = await Promise.all(
      files.map(async (f) => {
        try {
          const raw = JSON.parse(await readFile(join(dir(), f), 'utf8')) as unknown;
          return isLog(raw) ? raw : null;
        } catch {
          return null;
        }
      }),
    );
    return logs
      .filter((l): l is ConversationLog => l !== null)
      .map((l) => ({
        id: l.id,
        startedAt: l.startedAt,
        updatedAt: l.updatedAt,
        baseUrl: l.baseUrl,
        title: l.title,
        turnCount: l.turns.length,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async load(id) {
    try {
      const raw = JSON.parse(await readFile(join(dir(), `${id}.json`), 'utf8')) as unknown;
      return isLog(raw) ? raw : null;
    } catch {
      return null;
    }
  },
  async save(log) {
    await mkdir(dir(), { recursive: true });
    await writeFile(join(dir(), `${log.id}.json`), JSON.stringify(log, null, 2), 'utf8');
  },
});
