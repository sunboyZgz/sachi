import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writingPath, writingFile } from '../../src/lib/blog/storage';
import { BlogError, exists, sha256, stableJson, walk } from '../../src/lib/blog/files';
import { markdownReferences, splitDocument } from '../../src/lib/blog/document';
import { articleCatalogue } from './catalogue';
import { draftObject, verifyDraft } from './drafts';
import { cachedManifest } from './state';
import { applyBinaryWritingTransaction, assertNoPendingWrites, prepareDraftUndo, type BinaryChange } from './writing-transactions';

export type DraftRestorePlan = { id: string; articleId: string; title: string; sourcePath: string; changes: BinaryChange[]; directories: string[]; fingerprint: string };
const description = (entry: BinaryChange) => ({ file: entry.file, action: !entry.before ? '新增' : !entry.after ? '移除' : sha256(entry.before) === sha256(entry.after) ? '保留' : '恢复旧版' });
function legacyReferences(raw: string) {
  const { data, body } = splitDocument(raw);
  const flow = Array.isArray(data.flow) ? data.flow : [data.flow];
  return [...markdownReferences(body, { onIssue: () => {} }), data.cover, ...Object.keys(data.imageWindows && typeof data.imageWindows === 'object' && !Array.isArray(data.imageWindows) ? data.imageWindows : {}), ...flow.flatMap((item) => item && typeof item === 'object' ? [item.image, item.contour] : [])]
    .filter((url): url is string => typeof url === 'string').flatMap((url) => {
      try {
        const decoded = decodeURIComponent(url);
        if (!/^\.?\/assets\//.test(decoded)) return [];
        const file = `public/${decoded.replace(/^\.?\//, '')}`;
        if (path.posix.normalize(file) !== file) return [];
        return [file];
      } catch { return []; }
    });
}
export function draftRestoreResult(plan: DraftRestorePlan) {
  return { id: plan.id, articleId: plan.articleId, title: plan.title, sourcePath: plan.sourcePath, changes: plan.changes.map(description),
    changed: plan.changes.some((entry) => !entry.before || !entry.after || sha256(entry.before) !== sha256(entry.after)) };
}
export function describeDraftRestore(plan: DraftRestorePlan) {
  return [`将「${plan.title}」回档到稿件 ${plan.id}：`, ...plan.changes.map((entry) => `${description(entry).action} · ${entry.file}`),
    '先备份当前实际文件，再恢复正文和对应资源；可用 draft undo 撤销。', '只修改本地文章，不修改公开版本或自动发布。'].join('\n');
}

export async function prepareDraftRestore(root: string, id: string): Promise<DraftRestorePlan> {
  await assertNoPendingWrites(root);
  const { record, markdown } = await verifyDraft(root, id);
  const catalogue = await articleCatalogue(root);
  const matches = catalogue.articles.filter((article) => article.id.toLowerCase() === record.articleId);
  if (matches.length > 1) throw new BlogError('文章 ID 重复，拒绝回档。', 4, 'DRAFT_RESTORE_CONFLICT');
  const current = matches[0];
  const occupant = catalogue.articles.find((article) => article.file === record.sourcePath && article.id.toLowerCase() !== record.articleId);
  if (occupant) throw new BlogError(`原路径已属于其他文章：${record.sourcePath}`, 4, 'DRAFT_RESTORE_CONFLICT');
  // A broken frontmatter is recoverable: the raw current bytes are backed up first.
  if (!current && record.sourcePath.endsWith('/index.md') && await exists(await writingPath(root, record.sourcePath))) {
    let identity: unknown;
    try { identity = splitDocument((await readFile(await writingFile(root, record.sourcePath))).toString('utf8')).data.id; } catch { /* unfinished YAML */ }
    if (typeof identity === 'string' && identity.toLowerCase() !== record.articleId) throw new BlogError('原路径已写入其他文章身份，拒绝覆盖。', 4, 'DRAFT_RESTORE_CONFLICT');
  }
  const { manifest } = await cachedManifest(root);
  const published = [...(manifest?.entries ?? []), ...(manifest?.retired ?? [])].find((entry) => entry.id.toLowerCase() === record.articleId);
  if (published && published.slug !== record.slug) throw new BlogError('旧稿固定 URL 与已发布身份不同，不能通过回档更改公开文章的 URL。', 4, 'DRAFT_RESTORE_CONFLICT');
  const modern = record.sourcePath.endsWith('/index.md');
  const directories = modern ? [...new Set([path.posix.dirname(record.sourcePath), ...(current ? [path.posix.dirname(current.file)] : [])])] : [];
  if (current && current.file !== record.sourcePath && await exists(await writingPath(root, path.posix.dirname(record.sourcePath)))) {
    if ((await walk(await writingPath(root, path.posix.dirname(record.sourcePath)))).length) throw new BlogError('原日期目录已包含其他文件，拒绝覆盖。', 4, 'DRAFT_RESTORE_CONFLICT');
  }
  const before = new Map<string, Buffer>();
  for (const directory of directories) for (const file of await walk(await writingPath(root, directory))) {
    const relative = `${directory}/${file}`;
    before.set(relative, await readFile(await writingFile(root, relative)));
  }
  if (!modern) {
    const paths = new Set(record.files.map((entry) => entry.path));
    if (current) for (const file of legacyReferences(current.raw)) paths.add(file);
    for (const file of paths) if (await exists(await writingPath(root, file))) before.set(file, await readFile(await writingFile(root, file)));
  }
  const after = new Map<string, Buffer>();
  for (const entry of record.files) after.set(entry.path, await draftObject(root, record, entry));
  if (!modern) {
    // Shared assets introduced in the current draft remain in place and join its undo backup.
    for (const [file, bytes] of before) if (!after.has(file)) after.set(file, bytes);
    const changed = record.files.filter((entry) => entry.path.startsWith('public/assets/') && before.has(entry.path) && sha256(before.get(entry.path)!) !== entry.hash);
    if (changed.length && catalogue.issues.length) throw new BlogError('共享素材将变化，但存在无法检查的文章；拒绝影响其他文章。', 4, 'DRAFT_RESTORE_CONFLICT', catalogue.issues);
    for (const article of catalogue.articles.filter((article) => article.id.toLowerCase() !== record.articleId && !article.file.endsWith('/index.md'))) {
      const references = legacyReferences(article.raw);
      if (changed.some((entry) => references.includes(entry.path))) throw new BlogError(`共享素材也被「${article.title}」使用，拒绝覆盖；可先导出旧稿。`, 4, 'DRAFT_RESTORE_CONFLICT');
    }
  }
  const changes = [...new Set([...before.keys(), ...after.keys()])].sort().map((file) => ({ file, before: before.get(file) ?? null, after: after.get(file) ?? null }));
  if (current && before.get(current.file)?.toString('utf8') !== current.raw) throw new BlogError('准备回档期间原文变化，请重试。', 4, 'SOURCE_CHANGED');
  const fingerprint = sha256(stableJson({ draft: record.digest, markdown, identities: catalogue.articles.map(({ id, file }) => [id, file]), manifest,
    changes: changes.map((entry) => [entry.file, entry.before ? sha256(entry.before) : null, entry.after ? sha256(entry.after) : null]) }));
  return { id: record.id, articleId: record.articleId, title: record.title, sourcePath: record.sourcePath, changes, directories, fingerprint };
}

/** Caller owns writing.lock and publish.lock. */
export async function commitDraftRestore(root: string, plan: DraftRestorePlan, write?: Parameters<typeof applyBinaryWritingTransaction>[3]) {
  const fresh = await prepareDraftRestore(root, plan.id);
  if (fresh.fingerprint !== plan.fingerprint) throw new BlogError('确认后文章、素材或历史变化，未执行回档。', 4, 'SOURCE_CHANGED');
  const result = draftRestoreResult(fresh);
  if (!result.changed) return { ...result, transaction: null, backupPath: null };
  const transaction = await applyBinaryWritingTransaction(root, fresh.articleId, fresh.changes, write, async () => {
    const expected = fresh.changes.filter((entry) => entry.after).map((entry) => entry.file).sort();
    if (fresh.directories.length) {
      const actual = (await Promise.all(fresh.directories.map(async (directory) => (await walk(await writingPath(root, directory))).map((file) => `${directory}/${file}`)))).flat().sort();
      if (stableJson(actual) !== stableJson(expected)) throw new BlogError('回档期间目录出现额外修改，未提交。', 4, 'SOURCE_CHANGED');
    }
  });
  return { ...result, transaction, backupPath: `.blog-store/writing-transactions/${transaction}` };
}

export async function commitDraftUndo(root: string, id: string) {
  await assertNoPendingWrites(root);
  const plan = await prepareDraftUndo(root, id);
  const sharedChanges = plan.changes.filter((entry) => entry.file.startsWith('public/assets/') && entry.before && entry.after && sha256(entry.before) !== sha256(entry.after));
  if (sharedChanges.length) {
    const catalogue = await articleCatalogue(root);
    if (catalogue.issues.length || catalogue.articles.some((article) => article.id.toLowerCase() !== plan.articleId && !article.file.endsWith('/index.md') && sharedChanges.some((entry) => legacyReferences(article.raw).includes(entry.file)))) throw new BlogError('共享素材已有其他文章使用或无法核对，拒绝撤销覆盖。', 4, 'DRAFT_RESTORE_CONFLICT');
  }
  const transaction = await applyBinaryWritingTransaction(root, plan.articleId, plan.changes, undefined, async () => {
    if (plan.directories.length) {
      const actual = (await Promise.all(plan.directories.map(async (directory) => (await walk(await writingPath(root, directory))).map((file) => `${directory}/${file}`)))).flat().sort();
      const expected = plan.changes.filter((entry) => entry.after).map((entry) => entry.file).sort();
      if (stableJson(actual) !== stableJson(expected)) throw new BlogError('撤销期间出现额外文件，未提交。', 4, 'SOURCE_CHANGED');
    }
  });
  return { undo: id, articleId: plan.articleId, transaction, backupPath: `.blog-store/writing-transactions/${transaction}` };
}
