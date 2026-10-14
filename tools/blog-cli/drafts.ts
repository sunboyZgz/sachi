import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { createTwoFilesPatch } from 'diff';
import { parseDocument } from 'yaml';
import { imageReferences, markdownReferences, splitDocument } from '../../src/lib/blog/document';
import { BlogError, exists, inside, safeDirectory, safeFile, sha256, stableJson, walk } from '../../src/lib/blog/files';
import { postSchema } from '../../src/lib/blog/schema';
import { articleCatalogue, matchingArticles } from './catalogue';
import { assertNoPendingWrites } from './writing-transactions';

const sourcePath = z.string().regex(/^content\/(?:[^/]+\.md|(?:闲暇娱乐|生活旁白|蘸豆！！)\/\d{4}-\d{2}-\d{2}(?:-\d{2,})?\/index\.md)$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const fileSchema = z.strictObject({ path: z.string().min(1), hash, bytes: z.number().int().nonnegative().safe() });
const fields = {
  schemaVersion: z.union([z.literal(1), z.literal(2)]), id: z.uuid(), articleId: postSchema.shape.id,
  title: z.string().min(1), slug: z.string().min(1), sourcePath,
  sequence: z.number().int().positive().safe(), createdAt: z.iso.datetime(), note: z.string().max(1000),
  parentId: z.uuid().nullable(), files: z.array(fileSchema).min(1), warnings: z.array(z.string()),
};
export const draftRecordSchema = z.strictObject({ ...fields, digest: hash });
export type DraftRecord = z.infer<typeof draftRecordSchema>;
export type DraftPlan = { articleId: string; title: string; slug: string; sourcePath: string; note: string; files: DraftRecord['files']; warnings: string[]; sequence: number; parentId: string | null; fingerprint: string };
const base = '.blog-store/drafts';
const recordPath = (id: string) => `${base}/records/${id}.json`;
const objectPath = (value: string) => `${base}/objects/${value}`;
export const draftArchivePath = (record: Pick<DraftRecord, 'articleId' | 'id'>) => `${base}/versions/${record.articleId}/${record.id}`;
const recordFile = /^([a-f0-9-]{36})\.json$/;

function validateRecord(value: unknown) {
  const record = draftRecordSchema.parse(value);
  const { digest, ...contents } = record;
  if (sha256(stableJson(contents)) !== digest) throw new BlogError(`稿件记录摘要不匹配：${record.id}`, 4, 'DRAFT_INVALID');
  const modern = record.sourcePath.endsWith('/index.md');
  const directory = path.posix.dirname(record.sourcePath);
  if (record.files.filter((entry) => entry.path === record.sourcePath).length !== 1 || new Set(record.files.map((entry) => entry.path)).size !== record.files.length) throw new BlogError('稿件文件清单含重复项或缺少原文。', 4, 'DRAFT_INVALID');
  for (const entry of record.files) {
    inside('/draft-files', entry.path);
    if (path.posix.normalize(entry.path) !== entry.path || entry.path !== record.sourcePath && !(modern ? record.schemaVersion === 2 ? entry.path.startsWith(`${directory}/`) : entry.path === `${directory}/media.yaml` || entry.path.startsWith(`${directory}/assets/`) : entry.path.startsWith('public/assets/'))) throw new BlogError(`稿件文件超出本篇范围：${entry.path}`, 4, 'DRAFT_INVALID');
  }
  if (new Set(record.files.map((entry) => entry.path.normalize('NFC').toLowerCase())).size !== record.files.length) throw new BlogError('稿件文件清单含跨平台路径冲突。', 4, 'DRAFT_INVALID');
  return record;
}

/** Listing requires no current article or ready media; damaged records are reported. */
export async function draftCatalogue(root: string) {
  const drafts: DraftRecord[] = [];
  const issues: Array<{ file: string; message: string }> = [];
  const directory = path.join(root, base);
  let ancestor = root;
  for (const part of base.split('/')) {
    ancestor = path.join(ancestor, part);
    if (!await exists(ancestor)) return { drafts, issues };
    const info = await lstat(ancestor);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new BlogError('稿件记录目录不是安全的普通目录。', 4, 'DRAFT_INVALID');
  }
  const recordsDirectory = path.join(directory, 'records');
  if (await exists(recordsDirectory)) {
    if (!(await lstat(recordsDirectory)).isDirectory() || (await lstat(recordsDirectory)).isSymbolicLink()) throw new BlogError('旧稿件目录不安全。', 4, 'DRAFT_INVALID');
    for (const item of (await readdir(recordsDirectory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      // A crash before the atomic commit may leave an unpublished temporary file.
      if (/^\.pending-[a-f0-9-]{36}$/.test(item.name) && item.isFile()) continue;
      const relative = `${base}/records/${item.name}`;
      try {
        const id = recordFile.exec(item.name)?.[1];
        if (!id || !z.uuid().safeParse(id).success) throw new BlogError('无效的稿件记录文件名。');
        const record = validateRecord(JSON.parse(await readFile(await safeFile(root, relative), 'utf8')));
        if (record.id !== id || record.schemaVersion !== 1) throw new BlogError('旧稿件 ID 或格式与记录文件不符。');
        drafts.push(record);
      } catch (error) { issues.push({ file: relative, message: error instanceof Error ? error.message : String(error) }); }
    }
  }
  const versions = path.join(directory, 'versions');
  if (await exists(versions)) {
    if (!(await lstat(versions)).isDirectory() || (await lstat(versions)).isSymbolicLink()) throw new BlogError('完整稿件目录不安全。', 4, 'DRAFT_INVALID');
    for (const article of await readdir(versions, { withFileTypes: true })) {
      if (!article.isDirectory() || !postSchema.shape.id.safeParse(article.name).success) { issues.push({ file: `${base}/versions/${article.name}`, message: '无效完整稿件文章目录。' }); continue; }
      for (const version of await readdir(path.join(versions, article.name), { withFileTypes: true })) {
        if (version.isDirectory() && /^\.pending-[a-f0-9-]{36}$/.test(version.name)) continue;
        const relative = `${base}/versions/${article.name}/${version.name}/draft.json`;
        try {
          if (!version.isDirectory() || !z.uuid().safeParse(version.name).success) throw new BlogError('无效完整稿件目录。');
          const record = validateRecord(JSON.parse(await readFile(await safeFile(root, relative), 'utf8')));
          if (record.schemaVersion !== 2 || record.articleId !== article.name || record.id !== version.name) throw new BlogError('完整稿件目录与身份不符。');
          const old = drafts.findIndex((entry) => entry.id === record.id);
          if (old >= 0) {
            const previous = drafts[old];
            if (previous.articleId !== record.articleId || previous.sequence !== record.sequence || stableJson(previous.files) !== stableJson(record.files)) throw new BlogError('新旧稿件记录冲突。');
            drafts.splice(old, 1);
          }
          drafts.push(record);
        } catch (error) { issues.push({ file: relative, message: (error as Error).message }); }
      }
    }
  }
  drafts.sort((a, b) => a.articleId.localeCompare(b.articleId) || a.sequence - b.sequence || a.id.localeCompare(b.id));
  for (const record of drafts) if (drafts.some((other) => other.id !== record.id && other.articleId === record.articleId && other.sequence === record.sequence)) issues.push({ file: recordPath(record.id), message: '同一篇文章的稿件序号重复。' });
  return { drafts, issues };
}

export async function listDrafts(root: string, selector?: string) {
  const catalogue = await draftCatalogue(root);
  if (!selector) return catalogue;
  const local = await articleCatalogue(root);
  const matches = matchingArticles(root, local.articles, selector);
  if (matches.length > 1) throw new BlogError('文章选择不唯一，请使用完整 ID 或具体路径。', 2, 'INPUT_REQUIRED');
  const normalized = (path.isAbsolute(selector) ? path.relative(root, selector) : selector).replace(/^\.\//, '').split(path.sep).join('/').replace(/\/$/, '');
  const ids = new Set(matches.length ? [matches[0].id.toLowerCase()] : catalogue.drafts.filter((record) => record.articleId === selector.toLowerCase() || record.slug === selector || record.sourcePath === normalized || record.sourcePath.replace(/\/index.md$/, '') === normalized).map((record) => record.articleId));
  if (ids.size > 1) throw new BlogError('历史文章选择不唯一，请使用完整文章 ID。', 2, 'INPUT_REQUIRED');
  if (!ids.size) throw new BlogError(`找不到文章或稿件历史：${selector}`, 2, 'INPUT_REQUIRED', local.issues);
  return { drafts: catalogue.drafts.filter((record) => ids.has(record.articleId)), issues: catalogue.issues };
}

function metadataReferences(data: Record<string, unknown>) {
  const values: unknown[] = [data.cover];
  for (const flow of Array.isArray(data.flow) ? data.flow : [data.flow]) if (flow && typeof flow === 'object') values.push((flow as Record<string, unknown>).image, (flow as Record<string, unknown>).contour);
  return values.filter((value): value is string => typeof value === 'string');
}

/** Body/flow may be unfinished, but a full archive cannot contain unresolved local media. */
export async function prepareDraft(root: string, selector: string, note = '', options: { forComparison?: boolean } = {}): Promise<DraftPlan> {
  if (!options.forComparison) await assertNoPendingWrites(root);
  if (note.length > 1000 || note.includes('\0')) throw new BlogError('稿件备注最多 1000 字符，不允许空字符。', 2);
  const catalogue = await articleCatalogue(root);
  const matches = matchingArticles(root, catalogue.articles, selector);
  if (matches.length !== 1) throw new BlogError(`找不到唯一正式文章：${selector}。请先新建或补齐文章身份，再使用 ID、slug 或具体路径。`, 2, 'INPUT_REQUIRED', catalogue.issues);
  const article = matches[0];
  const history = await draftCatalogue(root);
  if (history.issues.length && !options.forComparison) throw new BlogError('稿件历史存在读取问题，请先核对，未新增稿件。', 4, 'DRAFT_INVALID', history.issues);
  const sameArticle = history.drafts.filter((record) => record.articleId === article.id.toLowerCase());
  const previous = sameArticle.at(-1);
  const { data, body } = splitDocument(article.raw);
  const modern = article.file.endsWith('/index.md');
  const directory = path.posix.dirname(article.file);
  const files = new Set([article.file]);
  const warnings: string[] = [];
  if (modern) {
    for (const file of await walk(path.join(root, directory))) files.add(`${directory}/${file}`);
  }
  const references = [...markdownReferences(body, { onIssue: (message) => warnings.push(message) }), ...metadataReferences(data)];
  for (const url of references) {
    if (/^(?:blog:|series:|#|mailto:|tel:)/i.test(url)) continue;
    if (/^https?:/i.test(url)) { if (/\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm)(?:[?#]|$)/i.test(url)) warnings.push(`外部素材只保留地址，未下载：${url}`); continue; }
    if (/^\/(?:article|series)\//.test(url)) continue;
    let target: string;
    try {
      const decoded = decodeURIComponent(url.split('#')[0]);
      if (modern ? !decoded.startsWith('./assets/') : !/^\.?\/assets\//.test(decoded)) { warnings.push(`未收集本篇以外的引用：${url}`); continue; }
      target = modern ? `${directory}/${decoded.slice(2)}` : `public/${decoded.replace(/^\.?\//, '')}`;
      inside(root, target);
    } catch { warnings.push(`未收集无法识别的资源地址：${url}`); continue; }
    if (!await exists(path.join(root, target))) { warnings.push(`素材尚未就绪，记录保留原引用：${url}`); continue; }
    await safeFile(root, target);
    if (!modern) files.add(target);
  }
  const captured: DraftRecord['files'] = [];
  const keys = new Set<string>();
  for (const file of [...files].sort()) {
    const key = file.normalize('NFC').toLowerCase();
    if (keys.has(key)) throw new BlogError(`稿件素材含跨平台路径冲突：${file}`, 4);
    keys.add(key);
    const bytes = await readFile(await safeFile(root, file));
    if (file === article.file && bytes.toString('utf8') !== article.raw) throw new BlogError('读取期间文章发生变化，请重新保存稿件。', 4, 'SOURCE_CHANGED');
    captured.push({ path: file, hash: sha256(bytes), bytes: bytes.length });
  }
  const result = { articleId: article.id.toLowerCase(), title: article.title, slug: modern ? typeof data.slug === 'string' ? data.slug : article.id : path.basename(article.file, '.md'), sourcePath: article.file,
    note, files: captured, warnings: [...new Set(warnings)], sequence: (previous?.sequence ?? 0) + 1, parentId: previous?.id ?? null };
  if (!options.forComparison) await validateDraftResources(article.file, article.raw, captured, async (file) => readFile(await safeFile(root, file)));
  const fingerprint = sha256(stableJson({ ...result, history: sameArticle.map((record) => [record.id, record.digest]) }));
  return { ...result, fingerprint };
}

/** Check the actual reference closure without requiring finished prose or rendering configuration. */
export async function validateDraftResources(file: string, markdown: string, files: DraftRecord['files'], read: (file: string) => Promise<Buffer>) {
  const { data, body } = splitDocument(markdown);
  const modern = file.endsWith('/index.md');
  const directory = path.posix.dirname(file);
  const inventory = new Set(files.map((entry) => entry.path));
  const mediaUrls = [...imageReferences(body), ...metadataReferences(data)];
  const preset = `${directory}/media.yaml`;
  if (modern && inventory.has(preset)) {
    const document = parseDocument((await read(preset)).toString('utf8'));
    if (document.errors.length) throw new BlogError(`media.yaml 无法核对资源：${document.errors[0].message}`, 3, 'DRAFT_INCOMPLETE');
    const media = document.toJSON();
    if (media?.assets && typeof media.assets === 'object' && !Array.isArray(media.assets)) {
      for (const [url, value] of Object.entries(media.assets)) {
        mediaUrls.push(url);
        if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).poster === 'string') mediaUrls.push((value as { poster: string }).poster);
      }
    }
  }
  const urls = markdownReferences(body, { onIssue: (message) => { throw new BlogError(`无法确保稿件资源完整：${message}`, 3, 'DRAFT_INCOMPLETE'); } });
  for (const url of new Set([...urls, ...mediaUrls])) {
    if (/^(?:https?:|\/\/)/i.test(url)) {
      if (mediaUrls.includes(url)) throw new BlogError(`完整归档要求本地媒体，请先将此资源放入 assets：${url}`, 3, 'DRAFT_INCOMPLETE');
      continue;
    }
    if (/^(?:blog:|series:|#|mailto:|tel:|\/article\/|\/series\/)/i.test(url) && !mediaUrls.includes(url)) continue;
    let target: string;
    try {
      const decoded = decodeURIComponent(url);
      if (/[?#]/.test(decoded) || (modern ? !decoded.startsWith('./assets/') : !/^\.?\/assets\//.test(decoded))) throw new Error('资源不在本篇 assets 中');
      target = modern ? `${directory}/${decoded.slice(2)}` : `public/${decoded.replace(/^\.?\//, '')}`;
      inside('/draft', target);
      if (path.posix.normalize(target) !== target) throw new Error('路径不规范');
    } catch { throw new BlogError(`完整归档无法收集资源引用：${url}`, 3, 'DRAFT_INCOMPLETE'); }
    if (!inventory.has(target)) throw new BlogError(`稿件资源缺失，未保存完整版本：${url}`, 3, 'DRAFT_INCOMPLETE');
  }
}

async function writeFullArchive(root: string, record: DraftRecord, read: (entry: DraftRecord['files'][number]) => Promise<Buffer>, beforeCommit: () => Promise<void> = async () => {}) {
  const parent = await safeDirectory(root, `${base}/versions/${record.articleId}`);
  const temporary = path.join(parent, `.pending-${randomUUID()}`);
  await mkdir(temporary);
  try {
    for (const entry of record.files) {
      const bytes = await read(entry);
      if (sha256(bytes) !== entry.hash || bytes.length !== entry.bytes) throw new BlogError(`复制时原文或资源变化：${entry.path}`, 4, 'SOURCE_CHANGED');
      await safeDirectory(temporary, path.posix.dirname(entry.path));
      await writeFile(inside(temporary, entry.path), bytes, { flag: 'wx', mode: 0o600 });
    }
    await writeFile(path.join(temporary, 'draft.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    for (const entry of record.files) {
      const bytes = await readFile(await safeFile(temporary, entry.path));
      if (sha256(bytes) !== entry.hash || bytes.length !== entry.bytes) throw new BlogError('完整稿件复制校验失败。', 4, 'DRAFT_INVALID');
    }
    await beforeCommit();
    const destination = inside(root, draftArchivePath(record));
    if (await exists(destination)) throw new BlogError('完整稿件 ID 已存在，拒绝覆盖。', 4, 'DRAFT_INVALID');
    await rename(temporary, destination);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

/** Caller holds writing.lock. Each committed directory is a standalone, full copy. */
export async function saveDraft(root: string, plan: DraftPlan): Promise<DraftRecord> {
  const fresh = await prepareDraft(root, plan.articleId, plan.note);
  if (fresh.fingerprint !== plan.fingerprint) throw new BlogError('确认后文章、素材或稿件历史发生变化，未留存稿件。', 4, 'SOURCE_CHANGED');
  const { fingerprint, ...contents } = plan;
  const value = { ...contents, schemaVersion: 2 as const, id: randomUUID(), createdAt: new Date().toISOString() };
  const record = validateRecord({ ...value, digest: sha256(stableJson(value)) });
  await writeFullArchive(root, record, async (entry) => readFile(await safeFile(root, entry.path)), async () => {
    if ((await prepareDraft(root, plan.articleId, plan.note)).fingerprint !== fingerprint) throw new BlogError('保存期间源文件变化，未登记稿件。', 4, 'SOURCE_CHANGED');
  });
  return record;
}

export async function draftObject(root: string, record: DraftRecord, entry: DraftRecord['files'][number]) {
  const relative = record.schemaVersion === 2 ? `${draftArchivePath(record)}/${entry.path}` : objectPath(entry.hash);
  if (!await exists(inside(root, relative))) throw new BlogError(`稿件文件缺失：${entry.path}`, 4, 'DRAFT_INVALID');
  const bytes = await readFile(await safeFile(root, relative));
  if (sha256(bytes) !== entry.hash || bytes.length !== entry.bytes) throw new BlogError(`稿件素材摘要不匹配：${entry.path}`, 4, 'DRAFT_INVALID');
  return bytes;
}

export async function readDraft(root: string, value: string) {
  const id = z.uuid().parse(value).toLowerCase();
  const catalogue = await draftCatalogue(root);
  const record = catalogue.drafts.find((entry) => entry.id === id);
  if (!record) throw new BlogError('找不到可读取的稿件记录。', 4, 'DRAFT_INVALID', catalogue.issues);
  const source = await draftObject(root, record, record.files.find((entry) => entry.path === record.sourcePath)!);
  const metadata = splitDocument(source.toString('utf8')).data;
  const articleId = record.sourcePath.endsWith('/index.md') ? String(metadata.id).toLowerCase() : `legacy-${sha256(record.sourcePath.slice('content/'.length)).slice(0, 24)}`;
  if (articleId !== record.articleId || postSchema.shape.title.parse(metadata.title) !== record.title) throw new BlogError('稿件身份与原文不符。', 4, 'DRAFT_INVALID');
  return { record, markdown: source.toString('utf8') };
}

export async function verifyDraft(root: string, id: string) {
  const result = await readDraft(root, id);
  if (result.record.schemaVersion === 2) {
    const actual = (await walk(inside(root, draftArchivePath(result.record)))).sort();
    if (stableJson(actual) !== stableJson(['draft.json', ...result.record.files.map((entry) => entry.path)].sort())) throw new BlogError('完整稿件目录与文件清单不符。', 4, 'DRAFT_INVALID');
  }
  for (const entry of result.record.files) await draftObject(root, result.record, entry);
  await validateDraftResources(result.record.sourcePath, result.markdown, result.record.files, async (file) => draftObject(root, result.record, result.record.files.find((entry) => entry.path === file)!));
  return result;
}

export async function prepareDraftMigration(root: string, selector?: string) {
  const catalogue = await listDrafts(root, selector);
  if (catalogue.issues.length) throw new BlogError('旧稿件记录存在读取问题，未转换。', 4, 'DRAFT_INVALID', catalogue.issues);
  const records = catalogue.drafts.filter((record) => record.schemaVersion === 1);
  for (const record of records) await verifyDraft(root, record.id);
  return records;
}

export async function migrateDrafts(root: string, records: DraftRecord[]) {
  for (const record of records) {
    const current = (await verifyDraft(root, record.id)).record;
    if (current.digest !== record.digest) throw new BlogError('确认后旧稿件记录变化，未继续转换。', 4, 'SOURCE_CHANGED');
    const fields = Object.fromEntries(Object.entries({ ...record, schemaVersion: 2 }).filter(([key]) => key !== 'digest'));
    const complete = validateRecord({ ...fields, digest: sha256(stableJson(fields)) });
    await writeFullArchive(root, complete, async (entry) => draftObject(root, record, entry));
  }
  return { migrated: records.map((record) => ({ id: record.id, title: record.title, archivePath: draftArchivePath(record) })), retainedLegacy: true };
}

export async function compareDrafts(root: string, first: string, second?: string) {
  const before = await readDraft(root, first);
  let after: { id: string; markdown: string; files: DraftRecord['files'] };
  if (second) {
    const next = await readDraft(root, second);
    if (next.record.articleId !== before.record.articleId) throw new BlogError('只能对比同一篇文章的两份稿件。', 2);
    after = { id: next.record.id, markdown: next.markdown, files: next.record.files };
  } else {
    const current = await prepareDraft(root, before.record.articleId, '', { forComparison: true });
    after = { id: 'working', markdown: (await readFile(await safeFile(root, current.sourcePath))).toString('utf8'), files: current.files };
    if (sha256(after.markdown) !== current.files.find((entry) => entry.path === current.sourcePath)!.hash) throw new BlogError('读取当前稿期间发生变化，请重试。', 4, 'SOURCE_CHANGED');
  }
  const patch = createTwoFilesPatch(before.record.id, after.id, before.markdown, after.markdown, undefined, undefined, { context: 3, timeout: 5000 });
  if (patch === undefined) throw new BlogError('稿件差异过大，已停止计算；请分别导出两稿进行对照。', 3);
  const previousFiles = new Map(before.record.files.map((entry) => [entry.path, entry.hash]));
  const nextFiles = new Map(after.files.map((entry) => [entry.path, entry.hash]));
  const files = [...new Set([...previousFiles.keys(), ...nextFiles.keys()])].sort().filter((file) => previousFiles.get(file) !== nextFiles.get(file)).map((file) => ({ file, before: previousFiles.get(file) ?? null, after: nextFiles.get(file) ?? null }));
  return { articleId: before.record.articleId, title: before.record.title, from: before.record.id, to: after.id, patch, files, changed: before.markdown !== after.markdown || files.length > 0 };
}

/** Exports use an empty new directory; the current article is never a restore target. */
export async function draftDestination(root: string, value?: string) {
  if (!value) throw new BlogError('draft export 需要 --destination <尚不存在的新目录>。', 2, 'INPUT_REQUIRED');
  const requested = path.resolve(root, value);
  let ancestor = requested;
  const missing: string[] = [];
  while (!await exists(ancestor)) { missing.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
  const target = path.join(await realpath(ancestor), ...missing);
  const project = await realpath(root);
  if (target === project || project.startsWith(`${target}${path.sep}`) || ['content', 'public', 'src', 'tools', 'bin', 'templates', 'docs-site', 'node_modules', '.blog', '.blog-store', '.git', 'out'].some((folder) => target === path.join(project, folder) || target.startsWith(`${path.join(project, folder)}${path.sep}`))) throw new BlogError('稿件导出目标不能是当前文章、项目源码、公开目录或持久存储；请使用独立的新目录。', 2);
  if (await exists(target)) throw new BlogError('稿件导出目标已存在，拒绝覆盖。', 2);
  return target;
}

export async function exportDraft(root: string, id: string, value: string) {
  const destination = await draftDestination(root, value);
  const { record } = await verifyDraft(root, id);
  // Validate every archived file before reserving the destination.
  for (const entry of record.files) await draftObject(root, record, entry);
  await mkdir(path.dirname(destination), { recursive: true });
  await mkdir(destination);
  try {
    for (const entry of record.files) {
      const file = inside(destination, entry.path);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, await draftObject(root, record, entry), { flag: 'wx', mode: 0o600 });
    }
    await writeFile(path.join(destination, 'draft.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    // Preserve any concurrent extra edits in the reserved directory for inspection.
    throw new BlogError(`稿件导出未完成，已保留部分目录 ${destination}：${error instanceof Error ? error.message : String(error)}`, 4, 'DRAFT_EXPORT_INCOMPLETE');
  }
  return { id: record.id, articleId: record.articleId, title: record.title, destination, sourceFile: path.join(destination, record.sourcePath), files: record.files.length, warnings: record.warnings };
}

export function describeDraft(plan: Pick<DraftPlan, 'title' | 'articleId' | 'sequence' | 'note' | 'sourcePath' | 'files' | 'warnings'>) {
  return [`文章：${plan.title} · ${plan.articleId}`, `留存第 ${plan.sequence} 稿${plan.note ? ` · ${plan.note}` : ''}`, `原文：${plan.sourcePath}`, `完整复制 ${plan.files.length} 项文件，共 ${plan.files.reduce((total, entry) => total + entry.bytes, 0)} 字节；每稿独立保存原文与素材。`, ...plan.warnings.map((warning) => `提示：${warning}`), '保存到本地完整稿件目录，不修改当前文章。'].join('\n');
}
