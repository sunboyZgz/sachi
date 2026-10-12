import { randomUUID } from 'node:crypto';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { z } from 'zod';
import { atomicWrite, BlogError, exists, safeDirectory, safeFile, sha256, writeJson } from '../../src/lib/blog/files';
import { storePath } from './config';

export type FileChange = { file: string; before: string; after: string };
const entrySchema = z.object({
  file: z.string().regex(/^content\/(?:[^/]+\.md|(?:闲暇娱乐|生活旁白|蘸豆！！)\/\d{4}-\d{2}-\d{2}(?:-\d{2,})?\/index\.md)$/),
  before: z.string(), after: z.string(), beforeHash: z.string().regex(/^[a-f0-9]{64}$/), afterHash: z.string().regex(/^[a-f0-9]{64}$/),
});
const journalSchema = z.object({
  id: z.string().uuid(), createdAt: z.string().datetime(), state: z.enum(['prepared', 'committed', 'rolled-back']),
  entries: z.array(entrySchema).min(1),
});
type Journal = z.infer<typeof journalSchema>;
const folder = 'writing-transactions';
const journalPath = (journal: Journal) => `.blog-store/${folder}/${journal.id}/journal.json`;

async function journals(root: string) {
  const directory = storePath(root, folder);
  if (!await exists(directory)) return [];
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new BlogError('写作事务目录不是安全的普通目录。', 4);
  const result: Journal[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !z.string().uuid().safeParse(entry.name).success) throw new BlogError('写作事务目录含无效记录。', 4);
    const relative = `.blog-store/${folder}/${entry.name}/journal.json`;
    // A crash before creating the journal cannot have changed article files.
    if (!await exists(storePath(root, folder, entry.name, 'journal.json'))) continue;
    const journal = journalSchema.parse(JSON.parse(await readFile(await safeFile(root, relative), 'utf8')));
    if (journal.id !== entry.name || new Set(journal.entries.map((item) => item.file)).size !== journal.entries.length
      || journal.entries.some((item) => sha256(item.before) !== item.beforeHash || sha256(item.after) !== item.afterHash)) throw new BlogError('写作事务恢复记录摘要不匹配。', 4);
    result.push(journal);
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function assertNoPendingWrites(root: string) {
  const pending = (await journals(root)).filter((journal) => journal.state === 'prepared');
  if (pending.length) throw new BlogError('上次系列插入尚未恢复，写作修改和构建发布已停止。请重新执行 series add 恢复；查询仍可使用。', 4, 'WRITING_RECOVERY_REQUIRED', { transactions: pending.map((journal) => journal.id) });
}

async function restore(root: string, journal: Journal) {
  // Check every file before restoring any, so extra editor changes are never overwritten.
  for (const entry of journal.entries) {
    const current = sha256(await readFile(await safeFile(root, entry.file)));
    if (current !== entry.beforeHash && current !== entry.afterHash) throw new BlogError(`恢复期间发现额外修改：${entry.file}。保留事务备份，未覆盖此文件。`, 4, 'WRITING_RECOVERY_CONFLICT', { transaction: journal.id, file: entry.file });
  }
  for (const entry of journal.entries.toReversed()) {
    const file = await safeFile(root, entry.file);
    const current = sha256(await readFile(file));
    if (current === entry.beforeHash) continue;
    if (current !== entry.afterHash) throw new BlogError(`恢复期间文章发生变化：${entry.file}`, 4, 'WRITING_RECOVERY_CONFLICT');
    await atomicWrite(file, entry.before);
  }
  await writeJson(await safeFile(root, journalPath(journal)), { ...journal, state: 'rolled-back' });
}

/** Call while holding writing.lock. Recovery restores the old state, then a new plan is calculated. */
export async function recoverWritingTransactions(root: string) {
  const pending = (await journals(root)).filter((journal) => journal.state === 'prepared');
  for (const journal of pending) await restore(root, journal);
  return pending.map((journal) => journal.id);
}

export async function prepareWritingTransaction(root: string, changes: FileChange[]): Promise<Journal> {
  await assertNoPendingWrites(root);
  const journal = journalSchema.parse({ id: randomUUID(), createdAt: new Date().toISOString(), state: 'prepared',
    entries: changes.map((change) => ({ ...change, beforeHash: sha256(change.before), afterHash: sha256(change.after) })) });
  if (new Set(changes.map((entry) => entry.file)).size !== changes.length) throw new BlogError('事务包含重复文章。', 4);
  for (const entry of journal.entries) if (sha256(await readFile(await safeFile(root, entry.file))) !== entry.beforeHash) throw new BlogError(`确认后文章发生变化：${entry.file}`, 4);
  await safeDirectory(root, `.blog-store/${folder}/${journal.id}`);
  await writeJson(storePath(root, folder, journal.id, 'journal.json'), journal);
  return journal;
}

export async function applyWritingTransaction(root: string, changes: FileChange[], write = atomicWrite) {
  const journal = await prepareWritingTransaction(root, changes);
  try {
    for (const entry of journal.entries) {
      const file = await safeFile(root, entry.file);
      if (sha256(await readFile(file)) !== entry.beforeHash) throw new BlogError(`确认后文章发生变化：${entry.file}`, 4);
      await write(file, entry.after);
    }
    // Verify all replacements before committing, including edits during the last write.
    for (const entry of journal.entries) if (sha256(await readFile(await safeFile(root, entry.file))) !== entry.afterHash) throw new BlogError(`写入期间文章发生变化：${entry.file}`, 4);
    await writeJson(await safeFile(root, journalPath(journal)), { ...journal, state: 'committed' });
    return journal.id;
  } catch (error) {
    try { await restore(root, journal); }
    catch (recoveryError) { throw new BlogError(`系列插入未完成，恢复记录已保留：${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`, 4, 'WRITING_RECOVERY_REQUIRED', { transaction: journal.id, cause: error instanceof Error ? error.message : String(error) }); }
    throw error;
  }
}
