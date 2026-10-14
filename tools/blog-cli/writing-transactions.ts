import { randomUUID } from 'node:crypto';
import { readdir, readFile, lstat, unlink, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { atomicWrite, BlogError, exists, inside, safeDirectory, safeFile, sha256, stableJson, walk, writeJson } from '../../src/lib/blog/files';
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
export type BinaryChange = { file: string; before: Buffer | null; after: Buffer | null };
const binaryFile = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative().safe() }).nullable();
const binaryJournalSchema = z.strictObject({
  schemaVersion: z.literal(2), kind: z.literal('draft-restore'), id: z.uuid(), articleId: z.string(),
  createdAt: z.iso.datetime(), state: z.enum(['prepared', 'committed', 'rolled-back']),
  entries: z.array(z.strictObject({ file: z.string(), before: binaryFile, after: binaryFile })).min(1),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
type BinaryJournal = z.infer<typeof binaryJournalSchema>;
type AnyJournal = Journal | BinaryJournal;
const folder = 'writing-transactions';
const journalPath = (journal: AnyJournal) => `.blog-store/${folder}/${journal.id}/journal.json`;
const binaryPath = (journal: BinaryJournal, side: 'before' | 'after', index: number) => `.blog-store/${folder}/${journal.id}/${side}/${index}.bin`;
const isBinary = (journal: AnyJournal): journal is BinaryJournal => 'schemaVersion' in journal;
function binaryDigest(journal: Omit<BinaryJournal, 'digest'> | BinaryJournal) {
  return sha256(stableJson(Object.fromEntries(Object.entries(journal).filter(([key]) => key !== 'digest'))));
}
function validateBinaryPath(file: string) {
  inside('/transaction', file);
  if (!/^content\/(?:[^/]+\.md|(?:闲暇娱乐|生活旁白|蘸豆！！)\/\d{4}-\d{2}-\d{2}(?:-\d{2,})?\/.+)$/.test(file) && !file.startsWith('public/assets/')) throw new BlogError(`回档事务文件越界：${file}`, 4);
}
async function binaryObject(root: string, journal: BinaryJournal, side: 'before' | 'after', index: number) {
  const entry = journal.entries[index][side];
  if (!entry) return null;
  const bytes = await readFile(await safeFile(root, binaryPath(journal, side, index)));
  if (sha256(bytes) !== entry.hash || bytes.length !== entry.bytes) throw new BlogError('回档事务备份摘要不匹配。', 4, 'WRITING_RECOVERY_CONFLICT');
  return bytes;
}
async function currentHash(root: string, file: string) {
  return await exists(inside(root, file)) ? sha256(await readFile(await safeFile(root, file))) : null;
}
async function replaceBinary(root: string, file: string, bytes: Buffer | null, write = atomicWrite) {
  if (bytes === null) { if (await exists(inside(root, file))) await unlink(await safeFile(root, file)); }
  else { await safeDirectory(root, path.posix.dirname(file)); await write(inside(root, file), bytes); }
}
async function pruneEmptyDirectories(root: string, files: string[]) {
  for (const file of files) {
    let directory = path.posix.dirname(file);
    const stop = file.startsWith('public/') ? 'public/assets' : file.endsWith('/index.md') || /^content\/[^/]+\/\d/.test(file) ? directory.split('/').slice(0, 2).join('/') : 'content';
    while (directory !== stop && directory !== 'content' && directory !== 'public/assets') {
      try { await rmdir(inside(root, directory)); } catch { break; }
      directory = path.posix.dirname(directory);
    }
  }
}
async function setBinaryState(root: string, journal: BinaryJournal, state: BinaryJournal['state']) {
  const next = { ...journal, state };
  await writeJson(await safeFile(root, journalPath(journal)), { ...next, digest: binaryDigest(next) });
}

async function journals(root: string) {
  const directory = storePath(root, folder);
  if (!await exists(directory)) return [];
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new BlogError('写作事务目录不是安全的普通目录。', 4);
  const result: AnyJournal[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !z.string().uuid().safeParse(entry.name).success) throw new BlogError('写作事务目录含无效记录。', 4);
    const relative = `.blog-store/${folder}/${entry.name}/journal.json`;
    // A crash before creating the journal cannot have changed article files.
    if (!await exists(storePath(root, folder, entry.name, 'journal.json'))) continue;
    const value = JSON.parse(await readFile(await safeFile(root, relative), 'utf8'));
    const journal = value.schemaVersion === 2 ? binaryJournalSchema.parse(value) : journalSchema.parse(value);
    if (journal.id !== entry.name || new Set(journal.entries.map((item) => item.file)).size !== journal.entries.length) throw new BlogError('写作事务恢复记录摘要不匹配。', 4);
    if (isBinary(journal)) {
      if (binaryDigest(journal) !== journal.digest) throw new BlogError('回档事务记录摘要不匹配。', 4);
      for (const item of journal.entries) { validateBinaryPath(item.file); if (!item.before && !item.after) throw new BlogError('无效回档事务条目。', 4); }
    } else if (journal.entries.some((item) => sha256(item.before) !== item.beforeHash || sha256(item.after) !== item.afterHash)) throw new BlogError('写作事务恢复记录摘要不匹配。', 4);
    result.push(journal);
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function assertNoPendingWrites(root: string) {
  const pending = (await journals(root)).filter((journal) => journal.state === 'prepared');
  if (pending.length) throw new BlogError('上次写作修改尚未恢复，写作修改和构建发布已停止。请重新执行原来的 series add、format 或 draft restore 恢复；查询仍可使用。', 4, 'WRITING_RECOVERY_REQUIRED', { transactions: pending.map((journal) => journal.id) });
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
  for (const journal of pending) {
    if (isBinary(journal)) await restoreBinary(root, journal);
    else await restore(root, journal);
  }
  return pending.map((journal) => journal.id);
}

async function restoreBinary(root: string, journal: BinaryJournal) {
  for (let index = 0; index < journal.entries.length; index++) {
    const entry = journal.entries[index];
    await binaryObject(root, journal, 'before', index);
    const current = await currentHash(root, entry.file);
    if (current !== (entry.before?.hash ?? null) && current !== (entry.after?.hash ?? null)) throw new BlogError(`回档恢复发现额外编辑：${entry.file}。备份已保留，拒绝覆盖。`, 4, 'WRITING_RECOVERY_CONFLICT');
  }
  for (let index = journal.entries.length - 1; index >= 0; index--) {
    const entry = journal.entries[index];
    const current = await currentHash(root, entry.file);
    if (current === (entry.before?.hash ?? null)) continue;
    if (current !== (entry.after?.hash ?? null)) throw new BlogError(`恢复期间文件变化：${entry.file}`, 4, 'WRITING_RECOVERY_CONFLICT');
    await replaceBinary(root, entry.file, await binaryObject(root, journal, 'before', index));
  }
  await pruneEmptyDirectories(root, journal.entries.map((entry) => entry.file));
  await setBinaryState(root, journal, 'rolled-back');
}

/** Full binary backups are durable before the first replacement, including additions/deletions. */
export async function prepareBinaryWritingTransaction(root: string, articleId: string, changes: BinaryChange[]) {
  await assertNoPendingWrites(root);
  if (!changes.length || new Set(changes.map((entry) => entry.file)).size !== changes.length) throw new BlogError('回档事务为空或含重复文件。', 4);
  for (const entry of changes) {
    validateBinaryPath(entry.file);
    if (!entry.before && !entry.after) throw new BlogError('无效回档事务。', 4);
    if (await currentHash(root, entry.file) !== (entry.before ? sha256(entry.before) : null)) throw new BlogError(`确认后文件变化：${entry.file}`, 4, 'SOURCE_CHANGED');
  }
  const contents = { schemaVersion: 2 as const, kind: 'draft-restore' as const, id: randomUUID(), articleId, createdAt: new Date().toISOString(), state: 'prepared' as const,
    entries: changes.map((entry) => ({ file: entry.file, before: entry.before ? { hash: sha256(entry.before), bytes: entry.before.length } : null, after: entry.after ? { hash: sha256(entry.after), bytes: entry.after.length } : null })) };
  const journal = binaryJournalSchema.parse({ ...contents, digest: binaryDigest(contents) });
  await safeDirectory(root, `.blog-store/${folder}/${journal.id}`);
  for (const side of ['before', 'after'] as const) {
    await safeDirectory(root, `.blog-store/${folder}/${journal.id}/${side}`);
    for (let index = 0; index < changes.length; index++) if (changes[index][side]) await writeFile(inside(root, binaryPath(journal, side, index)), changes[index][side]!, { flag: 'wx', mode: 0o600 });
  }
  await writeJson(storePath(root, folder, journal.id, 'journal.json'), journal);
  return journal;
}

export async function applyBinaryWritingTransaction(root: string, articleId: string, changes: BinaryChange[], write = atomicWrite, verify: () => Promise<void> = async () => {}) {
  const journal = await prepareBinaryWritingTransaction(root, articleId, changes);
  try {
    for (const entry of changes) {
      if (await currentHash(root, entry.file) !== (entry.before ? sha256(entry.before) : null)) throw new BlogError(`确认后文件变化：${entry.file}`, 4, 'SOURCE_CHANGED');
      await replaceBinary(root, entry.file, entry.after, write);
    }
    for (const entry of journal.entries) if (await currentHash(root, entry.file) !== (entry.after?.hash ?? null)) throw new BlogError(`回档期间文件变化：${entry.file}`, 4, 'SOURCE_CHANGED');
    await verify();
    await setBinaryState(root, journal, 'committed');
    await pruneEmptyDirectories(root, changes.map((entry) => entry.file));
    return journal.id;
  } catch (error) {
    try { await restoreBinary(root, journal); }
    catch (recoveryError) { throw new BlogError(`回档未完成，原稿与素材备份已保留：${(recoveryError as Error).message}`, 4, 'WRITING_RECOVERY_REQUIRED', { transaction: journal.id, cause: (error as Error).message }); }
    throw error;
  }
}

export async function prepareDraftUndo(root: string, id: string) {
  await assertNoPendingWrites(root);
  z.uuid().parse(id);
  const journal = (await journals(root)).find((entry) => entry.id === id);
  if (!journal || !isBinary(journal) || journal.state !== 'committed') throw new BlogError('找不到已完成的回档记录。', 2, 'INPUT_REQUIRED');
  const directories = [...new Set(journal.entries.map((entry) => /^content\/(?:闲暇娱乐|生活旁白|蘸豆！！)\/\d{4}-\d{2}-\d{2}(?:-\d{2,})?\//.exec(entry.file)?.[0].slice(0, -1)).filter((directory): directory is string => !!directory))];
  if (directories.length) {
    const actual = (await Promise.all(directories.map(async (directory) => (await walk(inside(root, directory))).map((file) => `${directory}/${file}`)))).flat().sort();
    const expected = journal.entries.filter((entry) => entry.after).map((entry) => entry.file).sort();
    if (stableJson(actual) !== stableJson(expected)) throw new BlogError('回档后目录出现额外文件，撤销不覆盖额外编辑。', 4, 'SOURCE_CHANGED');
  }
  const changes: BinaryChange[] = [];
  for (let index = 0; index < journal.entries.length; index++) {
    const entry = journal.entries[index];
    if (await currentHash(root, entry.file) !== (entry.after?.hash ?? null)) throw new BlogError(`回档后又有编辑：${entry.file}。请先留存新稿，撤销不覆盖额外编辑。`, 4, 'SOURCE_CHANGED');
    changes.push({ file: entry.file, before: await binaryObject(root, journal, 'after', index), after: await binaryObject(root, journal, 'before', index) });
  }
  return { articleId: journal.articleId, changes, directories };
}

export async function draftRestoreHistory(root: string) {
  return (await journals(root)).filter((journal): journal is BinaryJournal => isBinary(journal) && journal.state === 'committed');
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
    catch (recoveryError) { throw new BlogError(`写作修改未完成，恢复记录已保留：${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`, 4, 'WRITING_RECOVERY_REQUIRED', { transaction: journal.id, cause: error instanceof Error ? error.message : String(error) }); }
    throw error;
  }
}
