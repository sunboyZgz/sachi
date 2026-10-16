import path from 'node:path';
import { lstat, mkdir, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { BlogError, atomicWrite, exists, readJson, safeDirectory, safeFile, sha256, stableJson, walk, withLock, writeJson } from '../../src/lib/blog/files';
import { configSchema } from '../../src/lib/blog/schema';
import { assertNoPendingWrites } from '../blog-cli/writing-transactions';

type Move = { from: string; to: string; hashes: Record<string, string> };
export type Migration = { schemaVersion: 1; id: string; state: 'prepared' | 'completed' | 'rolled-back'; beforeConfig: string | null; afterConfig: string; moves: Move[]; protected: Record<string, string> };

export async function withDataLocks<T>(root: string, action: () => Promise<T>) {
  await ordinaryLocations(root);
  return withLock(path.join(root, '.blog/backup.lock'), () => withLock(path.join(root, '.blog/writing.lock'), () =>
    withLock(path.join(root, '.blog/publish.lock'), () => withLock(path.join(root, '.blog/git.lock'), action))));
}

async function ordinaryLocations(root: string) {
  for (const name of ['content', '.blog-store', '.blog-archive', '.blog']) if (await exists(path.join(root, name))) {
    const info = await lstat(path.join(root, name));
    if (info.isSymbolicLink() || !info.isDirectory()) throw new BlogError(`资料目录不是普通目录：${name}`, 4);
  }
}

export async function directoryHashes(directory: string) {
  const result: Record<string, string> = {};
  for (const file of await walk(directory)) result[file] = sha256(await readFile(await safeFile(directory, file)));
  return result;
}
async function verifyMove(root: string, move: Move, side: 'from' | 'to') {
  if (stableJson(await directoryHashes(path.join(root, move[side]))) !== stableJson(move.hashes)) throw new BlogError(`迁移文件已有变化，保留原状：${move[side]}`, 4);
}
async function protect(root: string, values: Record<string, string>) {
  for (const [file, hash] of Object.entries(values)) if (sha256(await readFile(await safeFile(root, file))) !== hash) throw new BlogError(`持久资料变化，停止迁移：${file}`, 4);
}
const journalPath = (root: string, id: string) => path.join(root, '.blog-archive', id, 'migration.json');
const markerPath = (root: string) => path.join(root, '.blog-store/storage-migration.json');
async function configBytes(root: string) { return await exists(path.join(root, 'blog.config.json')) ? readFile(await safeFile(root, 'blog.config.json'), 'utf8') : null; }

export async function prepareMigration(root: string, archiveEmptyBuilds = false): Promise<Migration | null> {
  await ordinaryLocations(root);
  await assertNoPendingWrites(root);
  const beforeConfig = await configBytes(root);
  const config = configSchema.parse(beforeConfig ? JSON.parse(beforeConfig) : { schemaVersion: 1, timezone: 'Asia/Shanghai', contentDir: await exists(path.join(root, 'content')) ? 'content' : '.blog-store/content' });
  if (config.contentDir === '.blog-store/content') {
    if (await exists(path.join(root, 'content'))) throw new BlogError('新旧原稿目录同时存在，请核对，不会自动合并。', 4);
    return null;
  }
  if (await exists(path.join(root, '.blog-store/content'))) throw new BlogError('迁移目标 .blog-store/content 已存在，拒绝覆盖。', 4);
  const id = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID()}`;
  const moves: Move[] = [];
  if (await exists(path.join(root, 'content'))) moves.push({ from: 'content', to: '.blog-store/content', hashes: await directoryHashes(path.join(root, 'content')) });
  if (archiveEmptyBuilds) {
    // Empty content alone is not proof of a disposable release: protect all live references.
    const current = await exists(path.join(root, '.blog-store/current.json')) ? await readJson(path.join(root, '.blog-store/current.json')) as { manifest?: unknown } : null;
    if (current?.manifest) throw new BlogError('存在当前发布，不能将构建历史归类为历史验收资料。', 4);
    for (const folder of ['plans', 'receipts', 'pages', 'snapshots', 'series-snapshots']) {
      if ((await walk(path.join(root, '.blog-store', folder))).length) throw new BlogError(`存在 ${folder} 引用，不能自动归档历史代码与发布包。`, 4);
    }
    const releases = path.join(root, '.blog-store/releases');
    for (const name of await exists(releases) ? await readdir(releases) : []) {
      const manifest = await readJson(await safeFile(releases, `${name}/release.json`)) as { entries?: unknown[]; retired?: unknown[]; withdrawn?: unknown[]; series?: unknown[]; baseReleaseId?: string | null };
      if (!Array.isArray(manifest.entries) || manifest.entries.length || manifest.retired?.length || manifest.withdrawn?.length || manifest.series?.length || manifest.baseReleaseId) throw new BlogError(`发布包不能确认为独立空站验收：${name}`, 4);
    }
    for (const folder of ['code', 'releases']) if (await exists(path.join(root, '.blog-store', folder))) {
      moves.push({ from: `.blog-store/${folder}`, to: `.blog-archive/${id}/${folder}`, hashes: await directoryHashes(path.join(root, '.blog-store', folder)) });
    }
  }
  const protectedFiles: Record<string, string> = {};
  const store = path.join(root, '.blog-store');
  for (const name of await exists(store) ? await readdir(store) : []) {
    if (['.git', 'content', ...moves.map((move) => move.from.replace('.blog-store/', ''))].includes(name)) continue;
    const full = path.join(store, name);
    if ((await lstat(full)).isFile()) protectedFiles[`.blog-store/${name}`] = sha256(await readFile(await safeFile(store, name)));
    else for (const [file, hash] of Object.entries(await directoryHashes(full))) protectedFiles[`.blog-store/${name}/${file}`] = hash;
  }
  // Keep explicit values and retain the original bytes for exact undo.
  const raw = beforeConfig ? JSON.parse(beforeConfig) : config;
  const afterConfig = `${JSON.stringify({ ...raw, contentDir: '.blog-store/content' }, null, 2)}\n`;
  return { schemaVersion: 1, id, state: 'prepared', beforeConfig, afterConfig, moves, protected: protectedFiles };
}

async function savedMigrations(root: string) {
  const directory = path.join(root, '.blog-archive');
  const result: Migration[] = [];
  for (const name of await exists(directory) ? await readdir(directory) : []) {
    if (!/^\d{4}-.*[a-f0-9-]{36}$/.test(name) || !await exists(journalPath(root, name))) continue;
    const value = await readJson(await safeFile(root, `.blog-archive/${name}/migration.json`)) as Migration;
    if (value.schemaVersion !== 1 || value.id !== name || !['prepared', 'completed', 'rolled-back'].includes(value.state)
      || value.moves.some((move) => !['content', '.blog-store/code', '.blog-store/releases'].includes(move.from)
        || move.to !== (move.from === 'content' ? '.blog-store/content' : `.blog-archive/${name}/${path.basename(move.from)}`))) throw new BlogError('迁移记录无效。', 4);
    result.push(value);
  }
  return result.sort((a, b) => b.id.localeCompare(a.id));
}

async function applyMigration(root: string, journal: Migration, afterMove?: () => Promise<void>) {
  const config = await configBytes(root);
  if (config !== journal.beforeConfig && config !== journal.afterConfig) throw new BlogError('迁移期间配置发生变化，保留记录，未覆盖。', 4);
  await protect(root, journal.protected);
  for (const move of journal.moves) {
    const from = path.join(root, move.from), to = path.join(root, move.to);
    const hasFrom = await exists(from), hasTo = await exists(to);
    if (hasFrom === hasTo) throw new BlogError(`迁移来源或目标冲突：${move.from}`, 4);
    await verifyMove(root, move, hasFrom ? 'from' : 'to');
    if (hasFrom) { await mkdir(path.dirname(to), { recursive: true }); await rename(from, to); }
    await verifyMove(root, move, 'to');
    await afterMove?.();
  }
  await protect(root, journal.protected);
  for (const move of journal.moves) await verifyMove(root, move, 'to');
  if (await configBytes(root) !== config) throw new BlogError('迁移期间配置发生变化，停止切换。', 4);
  await atomicWrite(path.join(root, 'blog.config.json'), journal.afterConfig);
  await writeJson(journalPath(root, journal.id), { ...journal, state: 'completed' });
  if (await exists(markerPath(root))) await unlink(markerPath(root));
  return { status: 'MIGRATED', journal: `.blog-archive/${journal.id}/migration.json`, files: journal.moves.reduce((total, move) => total + Object.keys(move.hashes).length, 0) };
}

/** A durable journal is written before the first rename; retry resumes without changing file bytes. */
export async function migrateStorage(root: string, options: { archiveEmptyBuilds?: boolean; dryRun?: boolean; afterMove?: () => Promise<void> } = {}) {
  if (options.dryRun) {
    for (const name of ['writing', 'publish', 'git', 'backup']) if (await exists(path.join(root, `.blog/${name}.lock`))) throw new BlogError(`另一个操作持有 ${name}.lock`, 4);
    const pending = (await savedMigrations(root)).find((item) => item.state === 'prepared');
    return { status: 'PLANNED', migration: pending ?? await prepareMigration(root, options.archiveEmptyBuilds) };
  }
  return withDataLocks(root, async () => {
    await assertNoPendingWrites(root);
    const saved = await savedMigrations(root);
    const marker = await exists(markerPath(root)) ? await readJson(markerPath(root)) as { id: string; direction: string } : null;
    let journal = marker ? saved.find((item) => item.id === marker.id) : saved.find((item) => item.state === 'prepared');
    if (marker && !journal) throw new BlogError('缺少迁移恢复记录，请保留现有文件。', 4);
    if (marker?.direction === 'undo' && journal) return applyUndo(root, journal);
    if (!journal) {
      journal = await prepareMigration(root, options.archiveEmptyBuilds) ?? undefined;
      if (!journal) return { status: 'UNCHANGED' };
      await safeDirectory(root, `.blog-archive/${journal.id}`);
      await writeJson(journalPath(root, journal.id), journal);
    }
    await writeJson(markerPath(root), { id: journal.id, direction: 'forward' });
    return applyMigration(root, journal, options.afterMove);
  });
}

export async function undoMigration(root: string, id: string) {
  return withDataLocks(root, async () => {
    await assertNoPendingWrites(root);
    const journal = (await savedMigrations(root)).find((item) => item.id === id);
    if (!journal || journal.state === 'rolled-back') throw new BlogError('找不到可撤销的迁移。', 2);
    const marker = await exists(markerPath(root)) ? await readJson(markerPath(root)) as { id: string } : null;
    if (marker && marker.id !== id) throw new BlogError('另一项迁移尚未完成，请先处理原记录。', 4);
    return applyUndo(root, journal);
  });
}

async function applyUndo(root: string, journal: Migration) {
    const config = await configBytes(root);
    if (config !== journal.beforeConfig && config !== journal.afterConfig) throw new BlogError('配置已有额外编辑，拒绝撤销覆盖。', 4);
    await protect(root, journal.protected);
    for (const move of journal.moves) {
      const from = await exists(path.join(root, move.from)), to = await exists(path.join(root, move.to));
      if (from === to) throw new BlogError('撤销迁移的路径存在冲突。', 4);
      await verifyMove(root, move, to ? 'to' : 'from');
    }
    await writeJson(markerPath(root), { id: journal.id, direction: 'undo' });
    for (const move of journal.moves.toReversed()) if (await exists(path.join(root, move.to))) {
      await mkdir(path.dirname(path.join(root, move.from)), { recursive: true });
      await rename(path.join(root, move.to), path.join(root, move.from));
    }
    if (journal.beforeConfig !== null) await atomicWrite(path.join(root, 'blog.config.json'), journal.beforeConfig);
    else if (await exists(path.join(root, 'blog.config.json'))) await unlink(path.join(root, 'blog.config.json'));
    await writeJson(journalPath(root, journal.id), { ...journal, state: 'rolled-back' });
    if (await exists(markerPath(root))) await unlink(markerPath(root));
    return { status: 'UNDONE', id: journal.id };
}
