import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { parseDocument, stringify } from 'yaml';
import { BlogError, exists, inside, readJson, safeFile, sha256, stableJson, walk, withLock, writeJson, atomicWrite } from '../../src/lib/blog/files';
import { assertStorageReady } from '../../src/lib/blog/storage';
import { scanContent } from '../../src/lib/blog/content';
import { postSchema, type BlogConfig } from '../../src/lib/blog/schema';
import { resourceRefSchema, type ResourceRef } from '../../src/lib/blog/yandu';
import { profileSchema } from '../../src/config/profile-schema';
import { cachePath, storePath } from './config';
import { YanduStorage, uploadImmutable } from './yandu';
import { assertNoPendingWrites } from './writing-transactions';
import { toyCatalogue, readToyRecord, localToyFile, templateTarget, toyRecordSchema } from './toys';

const checkpointId = /^checkpoint-\d{8}T\d{9}Z-[a-f0-9-]{36}$/;
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const privateResourceSchema = z.strictObject({ key: z.string(), resource: resourceRefSchema });
const parentListSchema = z.array(z.string().regex(checkpointId)).min(1);
const checkpointSchema = z.strictObject({ schemaVersion: z.literal(1), id: z.string().regex(checkpointId), projectId: z.string(), createdAt: z.iso.datetime(), contentDir: z.enum(['content', '.blog-store/content']), inventoryHash: digestSchema, parentCheckpoint: z.string().regex(checkpointId).nullable().optional(), parentCheckpoints: parentListSchema.optional(), files: z.array(z.strictObject({ path: z.string(), resource: resourceRefSchema })), privateResources: z.array(privateResourceSchema).optional() });
type Checkpoint = z.infer<typeof checkpointSchema>;
const privateFolders = ['drafts', 'snapshots', 'series-snapshots', 'history', 'writing-transactions', 'toys', 'plans', 'code', 'records', 'profile-history', 'receipts', 'releases', 'recovery-originals', 'resources'];
const privateFiles = ['current.json'];
const syncSchema = z.object({ checkpoint: z.string().regex(checkpointId), inventoryHash: digestSchema, savedAt: z.iso.datetime(), resource: resourceRefSchema });
const journalSchema = z.object({ schemaVersion: z.literal(1), id: z.string().regex(checkpointId), state: z.enum(['uploading', 'committing', 'saved', 'conflict']), inventoryHash: digestSchema, parentCheckpoint: z.string().regex(checkpointId).nullable(), parentCheckpoints: parentListSchema.optional(), createdAt: z.iso.datetime(), contentDir: z.enum(['content', '.blog-store/content']), inventory: z.array(z.object({ path: z.string(), sha256: digestSchema, bytes: z.number().int().nonnegative(), folder: z.string() })).optional(), files: checkpointSchema.shape.files, privateResources: z.array(privateResourceSchema).optional(), resource: resourceRefSchema.optional() });
type Journal = z.infer<typeof journalSchema>;
export type InventoryItem = { path: string; sourceFile: string; sha256: string; bytes: number; folder: string };
async function inventoryFiles(directory: string, prefix = ''): Promise<string[]> {
  if (!await exists(directory)) return [];
  if ((await lstat(directory)).isSymbolicLink()) throw new BlogError('私有资料目录不能是符号链接。', 3);
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', '.DS_Store', '.gitkeep'].includes(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new BlogError(`私有资料不允许符号链接：${relative}`, 3);
    if (entry.isDirectory()) files.push(...await inventoryFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else throw new BlogError(`私有资料不允许特殊文件：${relative}`, 3);
  }
  return files;
}
function validateRelative(relative: string) {
  if (path.isAbsolute(relative) || /^[a-z]:/i.test(relative) || /[\\\x00-\x1f]/.test(relative) || relative.split('/').some((part) => !part || part === '.' || part === '..' || part === '.git')) throw new BlogError(`私有恢复清单路径不安全：${relative}`, 3);
  return relative;
}
function restorePath(relative: string) {
  validateRelative(relative);
  if (relative.startsWith('content/')) return `.blog-store/${relative}`;
  if (relative.startsWith('legacy-public/assets/')) return relative.replace(/^legacy-public\//, 'public/');
  if (relative === 'src/config/profile.json' || /^src\/assets\/avatar\/avatar-(?:head|half)\.png$/.test(relative)) return relative;
  if (privateFolders.some((folder) => relative.startsWith(`.blog-store/${folder}/`))) return relative;
  if (privateFiles.some((file) => relative === `.blog-store/${file}`) || relative.startsWith('.blog-store/yandu/associations/')) return relative;
  if (/^works\/[a-f0-9-]{36}\/(?:cover|video)\.[a-zA-Z0-9]+$/.test(relative)) return `.blog-store/${relative}`;
  throw new BlogError(`私有恢复清单包含不允许的路径：${relative}`, 3);
}
export async function storageInventory(root: string, config: BlogConfig): Promise<InventoryItem[]> {
  await assertStorageReady(root); await assertNoPendingWrites(root);
  const inventory: InventoryItem[] = [];
  const scanned = await scanContent(root, config);
  if (scanned.issues.length) throw new BlogError(`迁移前请修复内容：${JSON.stringify(scanned.issues)}`, 3);
  const articleDirectories = scanned.posts.map((source) => ({ prefix: path.relative(root, source.directory).replaceAll(path.sep, '/'), id: source.post.id }));
  async function add(physical: string, logical: string, folder: string) {
    const file = await safeFile(root, physical); const bytes = await readFile(file);
    inventory.push({ path: logical, sourceFile: file, sha256: sha256(bytes), bytes: bytes.length, folder });
  }
  for (const relative of await inventoryFiles(path.join(root, config.contentDir))) {
    const physical = `${config.contentDir}/${relative}`;
    const article = articleDirectories.find((entry) => physical.startsWith(`${entry.prefix}/`) || physical === entry.prefix);
    await add(physical, `content/${relative}`, article ? `articles/${article.id}/private` : 'archives/content');
  }
  // Flat legacy articles can reference shared public/assets. Preserve only their
  // already validated dependencies; unrelated theme and decoration files stay code.
  const sharedRoot = path.join(root, 'public', 'assets'), shared = new Set<string>();
  for (const source of scanned.posts) for (const dependency of source.dependencies) {
    const relative = path.relative(sharedRoot, dependency.sourceFile);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) continue;
    const logical = `legacy-public/assets/${relative.split(path.sep).join('/')}`;
    if (shared.has(logical)) continue;
    shared.add(logical);
    await add(path.relative(root, dependency.sourceFile), logical, 'archives/legacy-public');
  }
  for (const folder of privateFolders) for (const relative of await inventoryFiles(storePath(root, folder))) await add(`.blog-store/${folder}/${relative}`, `.blog-store/${folder}/${relative}`, `archives/${folder}`);
  for (const file of privateFiles) if (await exists(storePath(root, file))) await add(`.blog-store/${file}`, `.blog-store/${file}`, 'archives/records');
  for (const file of await inventoryFiles(storePath(root, 'yandu', 'associations'))) await add(`.blog-store/yandu/associations/${file}`, `.blog-store/yandu/associations/${file}`, 'archives/associations');
  for (const file of ['src/config/profile.json', 'src/assets/avatar/avatar-head.png', 'src/assets/avatar/avatar-half.png']) if (await exists(path.join(root, file))) await add(file, file, file.endsWith('.png') ? 'profile/avatars/originals' : 'profile');
  // Toy source paths may be external; copy them into the recovery bundle by ID.
  const catalogue = await toyCatalogue(root);
  if (catalogue.issues.length) throw new BlogError(`作品资料未通过：${JSON.stringify(catalogue.issues)}`, 3);
  for (const entry of catalogue.toys) {
    const toy = await readToyRecord(root, entry.id);
    for (const kind of ['cover', 'video'] as const) {
    const source = await localToyFile(root, toy[kind]); const bytes = await readFile(source);
    inventory.push({ path: `works/${toy.id}/${kind}${path.extname(source).toLowerCase()}`, sourceFile: source, sha256: sha256(bytes), bytes: bytes.length, folder: `works/${toy.id}` });
  }
  }
  return inventory.sort((a, b) => a.path.localeCompare(b.path));
}
function inventoryDigest(items: Array<Pick<InventoryItem, 'path' | 'sha256' | 'bytes'>>) { return sha256(stableJson([...items].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(({ path, sha256, bytes }) => ({ path, sha256, bytes })))); }
function parentIds(value: Pick<Checkpoint, 'parentCheckpoint' | 'parentCheckpoints'>) { return value.parentCheckpoints ?? (value.parentCheckpoint ? [value.parentCheckpoint] : []); }
function sameIds(a: string[], b: string[]) { const left = [...a].sort(), right = [...b].sort(); return left.length === right.length && left.every((id, index) => id === right[index]); }
function validateCheckpoint(descriptor: Checkpoint, projectId: string, id: string) {
  const parents = parentIds(descriptor);
  if (descriptor.id !== id || descriptor.projectId !== projectId || parents.includes(id) || new Set(parents).size !== parents.length || descriptor.parentCheckpoint && descriptor.parentCheckpoints && !parents.includes(descriptor.parentCheckpoint)) throw new BlogError('恢复检查点绑定或父关系不一致。', 3);
  const paths = new Set<string>();
  for (const item of descriptor.files) {
    const relative = restorePath(item.path);
    if (paths.has(relative) || item.resource.projectId !== projectId) throw new BlogError('恢复路径重复或项目不一致。', 3);
    paths.add(relative);
  }
  for (const relative of paths) {
    const parts = relative.split('/');
    for (let length = 1; length < parts.length; length++) if (paths.has(parts.slice(0, length).join('/'))) throw new BlogError('恢复清单中目录与文件路径冲突。', 3);
  }
  const keys = new Set<string>();
  for (const item of descriptor.privateResources ?? []) {
    validateRelative(item.key);
    if (!/^(?:profile\/avatars\/|articles\/|works\/)/.test(item.key) || item.resource.projectId !== projectId || keys.has(item.key)) throw new BlogError('私有资源映射重复、越界或项目不一致。', 3);
    keys.add(item.key);
  }
  if (inventoryDigest(descriptor.files.map(({ path, resource }) => ({ path, sha256: resource.sha256, bytes: resource.bytes }))) !== descriptor.inventoryHash) throw new BlogError('恢复检查点 inventoryHash 不一致。', 3, 'INTEGRITY_FAILED');
}
async function privateResources(root: string, projectId: string) {
  const file = storePath(root, 'yandu', 'state.json');
  if (!await exists(file)) return [];
  const state = z.object({ projectId: z.string(), objects: z.record(z.string(), resourceRefSchema) }).parse(await readJson(file));
  if (state.projectId !== projectId) throw new BlogError('私有资源映射属于另一 Yandu 项目。', 4);
  return Object.entries(state.objects).filter(([key]) => /^(?:profile\/avatars\/|articles\/|works\/)/.test(key) && !key.includes('/private/')).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, resource]) => ({ key, resource }));
}
const syncFile = (root: string) => storePath(root, 'yandu', 'sync.json');
export async function storageStatus(root: string, config: BlogConfig) {
  const inventory = await storageInventory(root, config);
  const state = await exists(syncFile(root)) ? await readJson(syncFile(root)) as { inventoryHash: string; checkpoint: string; savedAt: string } : null;
  return { projectId: config.yandu?.projectId ?? null, state: state?.inventoryHash === inventoryDigest(inventory) ? 'saved' : 'local-changes', checkpoint: state?.checkpoint ?? null, savedAt: state?.savedAt ?? null, files: inventory.length, bytes: inventory.reduce((sum, file) => sum + file.bytes, 0) };
}
type RemoteCheckpoint = { id: string; name: string; descriptor: Checkpoint; resource: ResourceRef };
async function checkpoints(storage: YanduStorage): Promise<RemoteCheckpoint[]> {
  const folders = await storage.folders();
  const parent = folders.archives ?? (await storage.list('')).find((entry) => entry.name === 'archives' && entry.kind === 'folder' && !entry.deletedAt)?.id;
  if (!parent) return [];
  const completed: RemoteCheckpoint[] = [];
  for (const folder of (await storage.list(parent)).filter((entry) => entry.kind === 'folder' && !entry.deletedAt && checkpointId.test(entry.name))) {
    const entries = (await storage.list(folder.id)).filter((entry) => entry.kind === 'file' && !entry.deletedAt && /^[a-f0-9]{64}\.json$/.test(entry.name) && entry.versionId);
    // A folder is created before its file is READY. It is not a committed checkpoint.
    if (!entries.length) continue;
    if (entries.length !== 1) throw new BlogError(`检查点有多个提交文件：${folder.name}`, 4, 'CONFLICT');
    const entry = entries[0];
    const resource = resourceRefSchema.parse({ projectId: storage.projectId, objectId: entry.id, versionId: entry.versionId, sha256: entry.name.slice(0, 64), mime: 'application/json', bytes: entry.size });
    const temporary = cachePath(storage.root, 'yandu-checkpoints', `${randomUUID()}.json`);
    try {
      await storage.download(resource, temporary);
      const descriptor = checkpointSchema.parse(await readJson(temporary));
      validateCheckpoint(descriptor, storage.projectId, folder.name);
      completed.push({ id: folder.id, name: folder.name, descriptor, resource });
    } finally { await rm(temporary, { force: true }); }
  }
  return completed.sort((a, b) => b.name.localeCompare(a.name));
}
function checkpointHeads(remote: RemoteCheckpoint[]) {
  const byId = new Map(remote.map((entry) => [entry.name, entry]));
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(entry: RemoteCheckpoint) {
    if (visited.has(entry.name)) return;
    if (visiting.has(entry.name)) throw new BlogError('Yandu 检查点父关系成环。', 3, 'INTEGRITY_FAILED');
    visiting.add(entry.name);
    for (const parent of parentIds(entry.descriptor)) {
      const found = byId.get(parent);
      if (!found) throw new BlogError('Yandu 检查点缺失父检查点；请先核对远端保留记录。', 3, 'INTEGRITY_FAILED');
      visit(found);
    }
    visiting.delete(entry.name); visited.add(entry.name);
  }
  for (const entry of remote) visit(entry);
  const parents = new Set(remote.flatMap((entry) => parentIds(entry.descriptor)));
  return remote.filter((entry) => !parents.has(entry.name));
}
function conflict(message: string): never { throw new BlogError(`${message}；不可变分支和本地原件均已保留。运行 storage list，恢复到新目录核对并手动合并，再用 storage sync 为每个当前分支重复提供 --resolve <检查点>。`, 4, 'CONFLICT'); }
async function finishCheckpoint(root: string, journal: Journal, resource: ResourceRef) {
  await writeJson(syncFile(root), { checkpoint: journal.id, inventoryHash: journal.inventoryHash, savedAt: journal.createdAt, resource });
  const file = storePath(root, 'yandu', 'migrations', `${journal.id}.json`);
  await writeJson(file, { ...journal, state: 'saved', resource });
  return { state: 'saved', checkpoint: journal.id, files: journal.files.length, resource, journal: path.relative(root, file) };
}
export async function syncStorage(root: string, config: BlogConfig, options: { resolve?: string[] } = {}) {
  return await withLock(cachePath(root, 'writing.lock'), async () => {
    const storage = new YanduStorage(root, config); await storage.initialize();
    const inventory = await storageInventory(root, config); const digest = inventoryDigest(inventory);
    let baseline = await exists(syncFile(root)) ? syncSchema.parse(await readJson(syncFile(root))) : null;
    const remote = await checkpoints(storage);
    const heads = checkpointHeads(remote);
    const journals: Journal[] = [];
    for (const file of await walk(storePath(root, 'yandu', 'migrations'))) {
      if (!checkpointId.test(path.basename(file, '.json')) || !file.endsWith('.json')) continue;
      const parsed = journalSchema.safeParse(await readJson(storePath(root, 'yandu', 'migrations', file)));
      if (parsed.success && ['uploading', 'committing'].includes(parsed.data.state)) journals.push(parsed.data);
    }
    // The writer may have edited again after a lost response. Recover its previous
    // completed commit first, then publish the newer local inventory as its child.
    for (const candidate of journals) {
      const committed = remote.find((entry) => entry.name === candidate.id);
      if (committed) {
        if (committed.descriptor.inventoryHash !== candidate.inventoryHash || heads.length !== 1 || heads[0]?.name !== candidate.id) conflict('重试的检查点已不再是远端基线');
        const result = await finishCheckpoint(root, { ...candidate, files: committed.descriptor.files }, committed.resource);
        if (candidate.inventoryHash === digest) return result;
        baseline = syncSchema.parse(await readJson(syncFile(root)));
      }
    }
    const headIds = heads.map((entry) => entry.name);
    const resolving = options.resolve !== undefined;
    if (resolving && (!options.resolve!.length || new Set(options.resolve).size !== options.resolve!.length || !sameIds(options.resolve!, headIds))) conflict('显式解决集合必须精确包含当前全部远端分支');
    const pending = journals.filter((journal) => journal.inventoryHash === digest && !remote.some((entry) => entry.name === journal.id));
    if (pending.length > 1) conflict('本地存在多个未完成的同内容迁移计划');
    let journal = pending[0];
    if (journal) {
      if (!sameIds(headIds, parentIds(journal))) conflict('迁移重试期间远端写作基线变化');
    } else {
      if (heads.length > 1 && !resolving) conflict('Yandu 存在并发写作检查点');
      if (!resolving && (heads[0]?.name ?? null) !== (baseline?.checkpoint ?? null)) conflict('Yandu 存在另一个写作检查点');
      if (!resolving && baseline?.inventoryHash === digest) return { state: 'saved', checkpoint: baseline.checkpoint, files: inventory.length, unchanged: true };
      const createdAt = new Date().toISOString();
      journal = { schemaVersion: 1, id: `checkpoint-${createdAt.replaceAll('-', '').replaceAll(':', '').replace('.', '')}-${randomUUID()}`, state: 'uploading', inventoryHash: digest, parentCheckpoint: heads.length === 1 ? heads[0].name : null, ...(resolving ? { parentCheckpoints: [...headIds].sort() } : {}), createdAt, contentDir: config.contentDir, inventory: inventory.map(({ path, sha256, bytes, folder }) => ({ path, sha256, bytes, folder })), files: [] };
    }
    const id = journal.id;
    // Durable migration inventory before network uploads; originals are never removed.
    const journalFile = storePath(root, 'yandu', 'migrations', `${id}.json`);
    await writeJson(journalFile, journal);
    const previous = new Map(journal.files.map((entry) => [entry.path, entry.resource]));
    const files: Array<{ path: string; resource: ResourceRef }> = [];
    for (const item of inventory) {
      const bytes = await readFile(item.sourceFile);
      if (sha256(bytes) !== item.sha256) throw new BlogError(`同步前本地资料发生变化：${item.path}`, 4);
      let resource = previous.get(item.path);
      if (resource && (resource.sha256 !== item.sha256 || resource.bytes !== item.bytes || resource.projectId !== storage.projectId)) throw new BlogError('迁移记录与本地资料不一致。', 3, 'INTEGRITY_FAILED');
      if (resource) await storage.verify(resource);
      else resource = await storage.upload(item.folder, path.basename(item.sourceFile), bytes);
      files.push({ path: item.path, resource });
      journal = { ...journal, files }; await writeJson(journalFile, journal);
    }
    if (inventoryDigest(await storageInventory(root, config)) !== digest) throw new BlogError('同步中本地资料发生变化；已传对象保留，本次不提交写作检查点。', 4);
    // Detect concurrent checkpoints before committing; all checkpoints are immutable,
    // so a race retains both branches for explicit recovery rather than overwriting.
    const beforeCommit = await checkpoints(storage);
    const beforeHeads = checkpointHeads(beforeCommit);
    if (!sameIds(beforeHeads.map((entry) => entry.name), parentIds(journal))) { await writeJson(journalFile, { ...journal, state: 'conflict' }); conflict('同步期间远端写作基线变化'); }
    // Freeze only immutable identities from the live adapter state. Upload offsets
    // and newly created archive mappings remain local and never recurse into backups.
    const retainedPrivate = journal.privateResources ?? await privateResources(root, storage.projectId);
    const checkpoint = checkpointSchema.parse({ schemaVersion: 1, id, projectId: storage.projectId, createdAt: journal.createdAt, contentDir: journal.contentDir, inventoryHash: digest, parentCheckpoint: journal.parentCheckpoint, ...(journal.parentCheckpoints ? { parentCheckpoints: journal.parentCheckpoints } : {}), files, privateResources: retainedPrivate });
    validateCheckpoint(checkpoint, storage.projectId, id);
    // Persist the exact descriptor before its final upload so response loss can resume it.
    journal = { ...journal, state: 'committing', files, privateResources: retainedPrivate }; await writeJson(journalFile, journal);
    const ref = await storage.upload(`archives/${id}`, 'checkpoint.json', Buffer.from(`${JSON.stringify(checkpoint)}\n`));
    const afterHeads = checkpointHeads(await checkpoints(storage));
    if (afterHeads.length !== 1 || afterHeads[0].name !== id) { await writeJson(journalFile, { ...journal, state: 'conflict', resource: ref }); conflict('并发提交产生多个写作分支'); }
    return await finishCheckpoint(root, journal, ref);
  });
}
export async function listStorageCheckpoints(root: string, config: BlogConfig) {
  const storage = new YanduStorage(root, config);
  const remote = await checkpoints(storage), heads = checkpointHeads(remote);
  return remote.map(({ id, name, descriptor }) => ({ id, checkpoint: name, parentCheckpoint: descriptor.parentCheckpoint ?? null, ...(descriptor.parentCheckpoints ? { parentCheckpoints: descriptor.parentCheckpoints } : {}), head: heads.some((head) => head.name === name), state: heads.length > 1 ? 'conflict' : 'saved' }));
}
export async function restoreStorage(root: string, config: BlogConfig, checkpoint: string, destination: string) {
  if (!checkpointId.test(checkpoint)) throw new BlogError('请从 storage list 选择完整检查点名称。', 2);
  const target = path.resolve(root, destination);
  if (await exists(target) || target === path.parse(target).root) throw new BlogError('Yandu 恢复目标必须是尚不存在的新目录。', 2);
  const storage = new YanduStorage(root, config);
  const folder = (await checkpoints(storage)).find((entry) => entry.name === checkpoint);
  if (!folder) throw new BlogError('检查点不存在。', 2);
  const descriptor = folder.descriptor;
  validateCheckpoint(descriptor, storage.projectId, checkpoint);
  await templateTarget(root, destination, true);
  await mkdir(target);
  await writeJson(path.join(target, 'RECOVERY-INCOMPLETE.json'), { checkpoint, expectedFiles: descriptor.files.length });
  for (const item of descriptor.files) await storage.download(item.resource, inside(target, restorePath(item.path)));
  const originalName = z.string().min(1).max(255).refine((name) => name !== '.' && name !== '..' && name === path.basename(name) && !/[\\/\x00-\x1f<>:"|?*]/.test(name) && name.trimEnd() === name && !name.endsWith('.') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name), '原文件名不是跨平台安全的普通文件名。');
  const associationSchema = z.strictObject({ kind: z.enum(['article', 'work']), ownerId: postSchema.shape.id, originalName, resource: resourceRefSchema });
  const additional: Array<{ source: string; resource: ResourceRef; localPath: string }> = [];
  for (const item of descriptor.files.filter((item) => item.path.startsWith('.blog-store/yandu/associations/'))) {
    const association = associationSchema.parse(await readJson(inside(target, restorePath(item.path))));
    if (association.resource.projectId !== storage.projectId) throw new BlogError('恢复资源关联属于另一 Yandu 项目。', 3);
    additional.push({ source: item.path, resource: association.resource, localPath: `.blog-store/resources/${association.kind}/${association.ownerId}/${association.resource.sha256}/${association.originalName}` });
  }
  for (const item of descriptor.privateResources ?? []) additional.push({ source: item.key, resource: item.resource, localPath: `.blog-store/resources/yandu/${validateRelative(item.key)}` });
  const destinations = new Map<string, ResourceRef>();
  const originalDestinations = new Map(descriptor.files.map(({ path, resource }) => [restorePath(path), resource]));
  // Validate the entire secondary mapping before downloading any of its originals.
  for (const item of additional) {
    inside(target, validateRelative(item.localPath));
    const previous = destinations.get(item.localPath);
    if (previous && stableJson(previous) !== stableJson(item.resource)) throw new BlogError('私有恢复资源目标冲突。', 3);
    const original = originalDestinations.get(item.localPath);
    if (original && (original.sha256 !== item.resource.sha256 || original.bytes !== item.resource.bytes)) throw new BlogError('私有恢复资源会覆盖不同的已校验资料。', 3);
    destinations.set(item.localPath, item.resource);
  }
  const allDestinations = new Set([...originalDestinations.keys(), ...destinations.keys()]);
  for (const destination of allDestinations) {
    const parts = destination.split('/');
    for (let length = 1; length < parts.length; length++) if (allDestinations.has(parts.slice(0, length).join('/'))) throw new BlogError('私有恢复资源目录与文件冲突。', 3);
  }
  for (const [localPath, resource] of destinations) await storage.download(resource, inside(target, localPath));
  await writeJson(path.join(target, 'yandu-recovered-resources.json'), { checkpoint, resources: additional });
  await writeJson(storePath(target, 'yandu', 'state.json'), { schemaVersion: 1, projectId: storage.projectId, folders: {}, objects: Object.fromEntries((descriptor.privateResources ?? []).map(({ key, resource }) => [key, resource])), uploads: {} });
  for (const item of descriptor.files.filter((item) => /^content\/toys\/[a-f0-9-]{36}\/toy\.yaml$/.test(item.path))) {
    const file = inside(target, restorePath(item.path)); const raw = await readFile(file, 'utf8');
    const document = parseDocument(raw, { uniqueKeys: true, strict: true });
    if (document.errors.length || document.warnings.length) throw new BlogError('恢复作品记录 YAML 无效。', 3);
    const toy = toyRecordSchema.parse(document.toJS({ maxAliasCount: 0 }));
    const changed = { ...toy };
    for (const kind of ['cover', 'video'] as const) {
      const candidates = descriptor.files.filter((entry) => entry.path.startsWith(`works/${toy.id}/${kind}.`));
      if (candidates.length !== 1) throw new BlogError('恢复作品资源缺失或有歧义。', 3);
      changed[kind] = restorePath(candidates[0].path);
      if (candidates[0].resource.sha256 !== toy.validation[kind].hash || candidates[0].resource.bytes !== toy.validation[kind].bytes) throw new BlogError('恢复作品资料与资源摘要不一致。', 3);
    }
    await atomicWrite(inside(target, `.blog-store/recovery-originals/${checkpoint}/${item.path}`), raw);
    await atomicWrite(file, stringify(changed));
  }
  const profileFile = path.join(target, 'src/config/profile.json');
  if (await exists(profileFile)) {
    const profile = profileSchema.parse(await readJson(profileFile));
    for (const resource of Object.values(profile.avatars ?? {})) {
      if (resource.projectId !== storage.projectId || resource.mime !== 'image/png') throw new BlogError('恢复头像项目或展示格式不一致。', 3);
      await storage.download(resource, path.join(target, 'public/media/profile', `${resource.sha256}.png`));
    }
  }
  await writeJson(path.join(target, 'blog.config.json'), { schemaVersion: 1, timezone: config.timezone, contentDir: '.blog-store/content', yandu: config.yandu ? { ...config.yandu, credentialFile: '.sachi/yandu-upload.json' } : null });
  await writeJson(path.join(target, 'yandu-recovery.json'), descriptor);
  await writeJson(syncFile(target), { checkpoint, inventoryHash: descriptor.inventoryHash, savedAt: descriptor.createdAt, resource: folder.resource });
  await rm(path.join(target, 'RECOVERY-INCOMPLETE.json'));
  return { checkpoint, destination: target, files: descriptor.files.length, state: 'verified' };
}
export async function setProfileAvatar(root: string, config: BlogConfig, kind: 'head' | 'half', file: string) {
  const source = await localToyFile(root, file); const original = await readFile(source);
  const { data, info } = await sharp(original, { limitInputPixels: 80_000_000 }).rotate().png().toBuffer({ resolveWithObject: true });
  await uploadImmutable(root, config, 'profile/avatars/originals', path.basename(source), original);
  const resource = await uploadImmutable(root, config, 'profile/avatars', `${kind}.png`, data, { width: info.width, height: info.height });
  const profileFile = path.join(root, 'src/config/profile.json');
  await withLock(cachePath(root, 'writing.lock'), async () => {
    const profile = profileSchema.parse(await readJson(profileFile));
    // Keep a local history before switching the current public identity reference.
    await writeJson(storePath(root, 'profile-history', `${Date.now()}-${randomUUID()}.json`), profile);
    await atomicWrite(path.join(root, 'public/media/profile', `${resource.sha256}.png`), data);
    await writeJson(profileFile, { ...profile, avatars: { ...profile.avatars, [kind]: resource } });
  });
  return { kind, state: 'saved', resource };
}
