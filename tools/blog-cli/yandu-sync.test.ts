import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { exists, sha256, stableJson } from '../../src/lib/blog/files';
import { configSchema } from '../../src/lib/blog/schema';
import type { ResourceRef } from '../../src/lib/blog/yandu';
import { YanduStorage } from './yandu';
import { listStorageCheckpoints, restoreStorage, storageInventory, syncStorage } from './yandu-sync';
import { localToyFile, readToyRecord } from './toys';
import { scanContent } from '../../src/lib/blog/content';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function directory() { const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sachi-yandu-sync-'))); roots.push(root); return root; }
async function localFile(root: string, relative: string, bytes: string | Buffer) { const file = path.join(root, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); return file; }
const projectId = 'test-blog';
const config = configSchema.parse({ schemaVersion: 1, timezone: 'Asia/Shanghai', yandu: { gateway: 'http://127.0.0.1:18770', projectId, credentialEnv: 'YANDU_TEST_KEY' } });
type Entry = { id: string; parentId: string; name: string; kind: 'folder' | 'file'; versionId: string; deletedAt: number; generation: number; size: number };
type FileRef = { path: string; resource: ResourceRef };
function digest(files: FileRef[]) { return sha256(stableJson([...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(({ path, resource }) => ({ path, sha256: resource.sha256, bytes: resource.bytes })))); }
function memoryStorage() {
  vi.stubEnv('YANDU_TEST_KEY', 'local-test-only');
  const entries = new Map<string, Entry>(), folders: Record<string, string> = {}, objects = new Map<string, Buffer>();
  const hooks = { failFinalResponse: false, failDownloadObject: '', checkpointBarrier: null as null | (() => Promise<void>) };
  let serial = 0, uploads = 0;
  function folder(logical: string): string {
    if (!logical) return '';
    if (folders[logical]) return folders[logical];
    const parentId = folder(path.posix.dirname(logical) === '.' ? '' : path.posix.dirname(logical));
    const id = `folder-${++serial}`; folders[logical] = id;
    entries.set(id, { id, parentId, name: path.posix.basename(logical), kind: 'folder', versionId: '', deletedAt: 0, generation: 1, size: 0 }); return id;
  }
  function store(logical: string, filename: string, bytes: Buffer, metadata: Partial<ResourceRef> = {}): ResourceRef {
    const parentId = folder(logical), hash = sha256(bytes), name = `${hash}${path.extname(filename).toLowerCase()}`;
    const existing = [...entries.values()].find((entry) => entry.parentId === parentId && entry.name === name);
    if (existing) return { projectId, objectId: existing.id, versionId: existing.versionId, sha256: hash, bytes: bytes.length, mime: filename.endsWith('.json') ? 'application/json' : filename.endsWith('.png') ? 'image/png' : 'application/octet-stream', ...metadata };
    const id = `object-${++serial}`, versionId = `version-${serial}`;
    entries.set(id, { id, parentId, name, kind: 'file', versionId, deletedAt: 0, generation: 1, size: bytes.length });
    objects.set(`${id}/${versionId}`, Buffer.from(bytes)); uploads++;
    return { projectId, objectId: id, versionId, sha256: hash, bytes: bytes.length, mime: filename.endsWith('.json') ? 'application/json' : filename.endsWith('.png') ? 'image/png' : 'application/octet-stream', ...metadata };
  }
  function bytesFor(ref: ResourceRef) {
    const bytes = objects.get(`${ref.objectId}/${ref.versionId}`);
    if (!bytes || bytes.length !== ref.bytes || sha256(bytes) !== ref.sha256) throw new Error('Stored checksum mismatch');
    return bytes;
  }
  vi.spyOn(YanduStorage.prototype, 'initialize').mockImplementation(async () => {
    for (const logical of ['profile/avatars', 'articles', 'works', 'archives']) folder(logical);
    return { schemaVersion: 1, projectId, folders, capacity: { quotaBytes: 1024 ** 3, usedBytes: 0, reservedBytes: 0, freeBytes: 1024 ** 3 } };
  });
  vi.spyOn(YanduStorage.prototype, 'folders').mockImplementation(async () => folders);
  vi.spyOn(YanduStorage.prototype, 'list').mockImplementation(async (parentId) => [...entries.values()].filter((entry) => entry.parentId === parentId));
  vi.spyOn(YanduStorage.prototype, 'verify').mockImplementation(async (ref) => { bytesFor(ref); });
  vi.spyOn(YanduStorage.prototype, 'upload').mockImplementation(async (logical, filename, bytes, metadata) => {
    if (/^archives\/checkpoint-/.test(logical) && hooks.checkpointBarrier) await hooks.checkpointBarrier();
    const ref = store(logical, filename, Buffer.from(bytes), metadata);
    if (/^archives\/checkpoint-/.test(logical) && hooks.failFinalResponse) { hooks.failFinalResponse = false; throw new Error('The final upload response was lost'); }
    return ref;
  });
  vi.spyOn(YanduStorage.prototype, 'download').mockImplementation(async (ref, destination) => {
    if (ref.objectId === hooks.failDownloadObject) throw new Error('Disconnected during recovery');
    const bytes = bytesFor(ref); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes);
  });
  function checkpoint(files: FileRef[], override: Record<string, unknown> = {}) {
    const createdAt = new Date().toISOString(), id = `checkpoint-${createdAt.replaceAll('-', '').replaceAll(':', '').replace('.', '')}-${randomUUID()}`;
    const descriptor = { schemaVersion: 1, id, projectId, createdAt, contentDir: '.blog-store/content', parentCheckpoint: null, inventoryHash: digest(files), files, ...override };
    const ref = store(`archives/${id}`, 'checkpoint.json', Buffer.from(JSON.stringify(descriptor)));
    return { id, descriptor, ref };
  }
  return { folder, store, checkpoint, hooks, objects, uploads: () => uploads, entries };
}

describe('private Yandu writing checkpoints', () => {
  it('lists only complete immutable checkpoints and resumes a lost final upload response', async () => {
    const remote = memoryStorage(), root = await directory();
    await localFile(root, '.blog-store/content/note.txt', 'private working source');
    remote.folder(`archives/checkpoint-20261016T000000000Z-${randomUUID()}`);
    expect(await listStorageCheckpoints(root, config)).toEqual([]);
    remote.hooks.failFinalResponse = true;
    await expect(syncStorage(root, config)).rejects.toThrow('final upload response');
    const list = await listStorageCheckpoints(root, config); expect(list).toHaveLength(1);
    const count = remote.uploads();
    const result = await syncStorage(root, config);
    expect(result.checkpoint).toBe(list[0].checkpoint); expect(remote.uploads()).toBe(count);
    expect(JSON.parse(await readFile(path.join(root, '.blog-store/yandu/sync.json'), 'utf8')).checkpoint).toBe(list[0].checkpoint);
    expect(await syncStorage(root, config)).toMatchObject({ unchanged: true });
  });

  it('retains concurrent branches and reports CONFLICT instead of selecting the newest name', async () => {
    const remote = memoryStorage(), a = await directory(), b = await directory();
    await localFile(a, '.blog-store/content/note.txt', 'client a'); await localFile(b, '.blog-store/content/note.txt', 'client b');
    let arrived = 0, release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    remote.hooks.checkpointBarrier = async () => { if (++arrived === 2) release(); await barrier; };
    const results = await Promise.allSettled([syncStorage(a, config), syncStorage(b, config)]);
    expect(results.every((result) => result.status === 'rejected' && result.reason.status === 'CONFLICT')).toBe(true);
    const branches = await listStorageCheckpoints(a, config);
    expect(branches).toHaveLength(2); expect(branches.every((branch) => branch.head && branch.state === 'conflict')).toBe(true);
    expect(await exists(path.join(a, '.blog-store/yandu/sync.json'))).toBe(false);
    expect(await exists(path.join(b, '.blog-store/yandu/sync.json'))).toBe(false);
  });

  it('recognizes a completed commit after response loss even when writing continued locally', async () => {
    const remote = memoryStorage(), root = await directory();
    await localFile(root, '.blog-store/content/note.txt', 'first completed draft');
    remote.hooks.failFinalResponse = true;
    await expect(syncStorage(root, config)).rejects.toThrow('final upload response');
    const first = (await listStorageCheckpoints(root, config))[0];
    await localFile(root, '.blog-store/content/note.txt', 'more local writing after the lost response');
    const next = await syncStorage(root, config), list = await listStorageCheckpoints(root, config);
    expect(list).toHaveLength(2);
    expect(list.find((entry) => entry.checkpoint === next.checkpoint)?.parentCheckpoint).toBe(first.checkpoint);
    expect(list.every((entry) => entry.state === 'saved')).toBe(true);
  });

  it('converges explicit complete branch resolution to one head and resumes a lost merge response', async () => {
    const remote = memoryStorage(), root = await directory();
    const a = remote.checkpoint([]), b = remote.checkpoint([]);
    await localFile(root, '.blog-store/content/note.txt', 'the author has manually merged both drafts');
    const before = remote.uploads();
    await expect(syncStorage(root, config, { resolve: [a.id] })).rejects.toMatchObject({ status: 'CONFLICT' });
    await expect(syncStorage(root, config, { resolve: [a.id, a.id, b.id] })).rejects.toMatchObject({ status: 'CONFLICT' });
    expect(remote.uploads()).toBe(before);
    remote.hooks.failFinalResponse = true;
    await expect(syncStorage(root, config, { resolve: [a.id, b.id] })).rejects.toThrow('final upload response');
    const merged = await syncStorage(root, config, { resolve: [a.id, b.id] });
    const list = await listStorageCheckpoints(root, config), heads = list.filter((entry) => entry.head);
    expect(heads).toHaveLength(1);
    expect(heads[0]).toMatchObject({ checkpoint: merged.checkpoint, state: 'saved', parentCheckpoints: expect.arrayContaining([a.id, b.id]) });
    expect(list.filter((entry) => [a.id, b.id].includes(entry.checkpoint)).every((entry) => !entry.head)).toBe(true);
    expect(await readFile(path.join(root, '.blog-store/content/note.txt'), 'utf8')).toBe('the author has manually merged both drafts');
    expect(await syncStorage(root, config)).toMatchObject({ unchanged: true });
  });

  it('links sequential checkpoints through their immutable parent and includes release recovery data', async () => {
    memoryStorage(); const root = await directory();
    await localFile(root, '.blog-store/content/note.txt', 'first version');
    await localFile(root, '.blog-store/code/code-hash/src/component.ts', 'frozen code');
    await localFile(root, '.blog-store/snapshots/revision/snapshot.json', '{}');
    await localFile(root, '.blog-store/current.json', '{}');
    await localFile(root, '.blog-store/receipts/release.json', '{}');
    await localFile(root, '.blog-store/yandu/associations/article.json', '{}');
    await localFile(root, '.blog-store/content/.DS_Store', 'finder cache');
    await localFile(root, '.blog-store/content/.gitkeep', 'empty marker');
    await localFile(root, '.blog-store/content/.git/config', 'private git configuration');
    const inventory = await storageInventory(root, config);
    expect(inventory.map((item) => item.path)).toEqual(expect.arrayContaining(['.blog-store/code/code-hash/src/component.ts', '.blog-store/current.json', '.blog-store/receipts/release.json', '.blog-store/yandu/associations/article.json']));
    expect(inventory.some((item) => /(?:\.git\/|\.DS_Store|\.gitkeep)/.test(item.path))).toBe(false);
    const first = await syncStorage(root, config);
    await localFile(root, '.blog-store/content/note.txt', 'second version');
    const second = await syncStorage(root, config);
    const list = await listStorageCheckpoints(root, config);
    expect(list.find((entry) => entry.checkpoint === second.checkpoint)).toMatchObject({ parentCheckpoint: first.checkpoint, head: true });
    expect(list.find((entry) => entry.checkpoint === first.checkpoint)?.head).toBe(false);
  });

  it('restores only referenced shared assets for unpublished flat legacy articles', async () => {
    memoryStorage(); const root = await directory();
    const legacy = configSchema.parse({ ...config, contentDir: 'content', yandu: { ...config.yandu, credentialFile: path.join(root, '.sachi/private-upload.json') } });
    await localFile(root, 'blog.config.json', JSON.stringify(legacy));
    const shared = Buffer.from('legacy shared original image');
    await localFile(root, 'public/assets/shared.png', shared);
    await localFile(root, 'public/assets/unused-theme.png', 'unreferenced theme image');
    await localFile(root, 'content/first.md', '---\ntitle: First legacy article\ncategory: life\ndate: 2026-10-16\n---\n\n![Shared](/assets/shared.png)\n');
    await localFile(root, 'content/second.md', '---\ntitle: Second legacy article\ncategory: life\ndate: 2026-10-16\n---\n\n![Shared again](./assets/shared.png)\n');
    const inventory = await storageInventory(root, legacy);
    expect(inventory.filter((item) => item.path.startsWith('legacy-public/')).map((item) => item.path)).toEqual(['legacy-public/assets/shared.png']);
    expect(inventory.some((item) => item.path.includes('unused-theme'))).toBe(false);
    const checkpoint = await syncStorage(root, legacy);
    const recovered = await restoreStorage(root, legacy, checkpoint.checkpoint, 'recovered');
    expect(await readFile(path.join(recovered.destination, 'public/assets/shared.png'))).toEqual(shared);
    expect(await exists(path.join(recovered.destination, 'public/assets/unused-theme.png'))).toBe(false);
    const restoredConfig = configSchema.parse(JSON.parse(await readFile(path.join(recovered.destination, 'blog.config.json'), 'utf8')));
    expect(restoredConfig.yandu?.credentialFile).toBe('.sachi/yandu-upload.json');
    expect(await exists(path.join(recovered.destination, '.sachi'))).toBe(false);
    const posts = await scanContent(recovered.destination, restoredConfig);
    expect(posts.issues).toEqual([]); expect(posts.posts).toHaveLength(2);
    expect(posts.posts.every((post) => post.dependencies[0].hash === sha256(shared))).toBe(true);
  });

  it.each(['hash', 'traversal', 'duplicate', 'ancestor'] as const)('rejects a %s recovery manifest before creating the destination', async (kind) => {
    const remote = memoryStorage(), root = await directory();
    const resource = remote.store('archives/content', 'note.txt', Buffer.from('safe bytes'));
    let files: FileRef[] = [{ path: 'content/note.txt', resource }];
    if (kind === 'traversal') files = [{ path: 'content/../../escaped.txt', resource }];
    if (kind === 'duplicate') files.push({ ...files[0] });
    if (kind === 'ancestor') files = [{ path: 'content/folder', resource }, { path: 'content/folder/note.txt', resource }];
    const checkpoint = remote.checkpoint(files, kind === 'hash' ? { inventoryHash: '0'.repeat(64) } : {});
    await expect(restoreStorage(root, config, checkpoint.id, 'recovered')).rejects.toThrow();
    expect(await exists(path.join(root, 'recovered'))).toBe(false);
    expect(await exists(path.join(root, 'escaped.txt'))).toBe(false);
  });

  it('keeps a recovery marker when a referenced file cannot be downloaded', async () => {
    const remote = memoryStorage(), root = await directory();
    const resource = remote.store('archives/content', 'note.txt', Buffer.from('private original'));
    const checkpoint = remote.checkpoint([{ path: 'content/note.txt', resource }]);
    remote.hooks.failDownloadObject = resource.objectId;
    await expect(restoreStorage(root, config, checkpoint.id, 'recovered')).rejects.toThrow('Disconnected');
    expect(await exists(path.join(root, 'recovered/RECOVERY-INCOMPLETE.json'))).toBe(true);
    expect(await exists(path.join(root, 'recovered/yandu-recovery.json'))).toBe(false);
  });

  it('recovers associated external originals and frozen private avatar mappings without uploading originals again', async () => {
    const remote = memoryStorage(), root = await directory(), ownerId = randomUUID();
    const attachment = Buffer.from('external private attachment'), originalAvatar = Buffer.from('private avatar original');
    const attachmentRef = remote.store(`articles/${ownerId}`, 'private.pdf', attachment);
    const avatarRef = remote.store('profile/avatars/originals', 'original.jpg', originalAvatar);
    const key = `profile/avatars/originals/${avatarRef.sha256}.jpg`;
    const association = { kind: 'article', ownerId, originalName: 'private.pdf', resource: attachmentRef };
    const associationFile = `.blog-store/yandu/associations/${ownerId}-${attachmentRef.sha256}.json`;
    await localFile(root, associationFile, JSON.stringify(association));
    await localFile(root, '.blog-store/yandu/state.json', JSON.stringify({ schemaVersion: 1, projectId, objects: { [key]: avatarRef }, folders: {}, uploads: {} }));
    const synced = await syncStorage(root, config), uploads = remote.uploads();
    await restoreStorage(root, config, synced.checkpoint, 'recovered');
    const target = path.join(root, 'recovered');
    expect(remote.uploads()).toBe(uploads);
    expect(await readFile(path.join(target, `.blog-store/resources/article/${ownerId}/${attachmentRef.sha256}/private.pdf`))).toEqual(attachment);
    expect(await readFile(path.join(target, `.blog-store/resources/yandu/${key}`))).toEqual(originalAvatar);
    expect(JSON.parse(await readFile(path.join(target, associationFile), 'utf8'))).toEqual(association);
    expect(JSON.parse(await readFile(path.join(target, '.blog-store/yandu/state.json'), 'utf8')).objects[key]).toEqual(avatarRef);
    expect(JSON.parse(await readFile(path.join(target, 'yandu-recovered-resources.json'), 'utf8')).resources).toHaveLength(2);
  });

  it('validates all association names before reading any associated original', async () => {
    const remote = memoryStorage(), root = await directory(), ownerId = randomUUID();
    const original = remote.store(`articles/${ownerId}`, 'private.pdf', Buffer.from('private attachment'));
    const good = remote.store('archives/associations', 'good.json', Buffer.from(JSON.stringify({ kind: 'article', ownerId, originalName: 'private.pdf', resource: original })));
    const bad = remote.store('archives/associations', 'bad.json', Buffer.from(JSON.stringify({ kind: 'article', ownerId, originalName: '../escaped.pdf', resource: original })));
    const checkpoint = remote.checkpoint([{ path: '.blog-store/yandu/associations/a.json', resource: good }, { path: '.blog-store/yandu/associations/b.json', resource: bad }]);
    await expect(restoreStorage(root, config, checkpoint.id, 'recovered')).rejects.toThrow();
    expect(vi.mocked(YanduStorage.prototype.download).mock.calls.some(([ref]) => ref.objectId === original.objectId)).toBe(false);
    expect(await exists(path.join(root, 'recovered/RECOVERY-INCOMPLETE.json'))).toBe(true);
  });

  it('restores external work media, preserves original records and primes profile avatar previews', async () => {
    const remote = memoryStorage(), root = await directory(), external = await directory(), id = randomUUID();
    const cover = Buffer.from('original cover bytes'), video = Buffer.from('original video bytes'), avatar = Buffer.from('avatar png bytes');
    const coverFile = await localFile(external, 'cover.png', cover), videoFile = await localFile(external, 'clip.mp4', video);
    const now = new Date().toISOString();
    const toy = { schemaVersion: 1, id, title: 'A work', description: 'Private work material', cover: coverFile, video: videoFile, projectUrl: 'https://example.com/', coverFit: 'cover', coverPosition: [50, 50], videoOverflow: 'reject', state: 'pending-media', createdAt: now,
      validation: { checkedAt: now, project: { url: 'https://example.com/', finalUrl: 'https://example.com/', statusCode: 200, checkedAt: now }, cover: { hash: sha256(cover), bytes: cover.length, width: 10, height: 10, format: 'png' }, video: { hash: sha256(video), bytes: video.length, width: 20, height: 20, durationSeconds: 1, format: 'mp4' } },
      processing: { maxOutputBytes: 10_000_000, outputBytes: null, retainedSeconds: null } };
    const raw = stringify(toy);
    await localFile(root, `.blog-store/content/toys/${id}/toy.yaml`, raw);
    const avatarRef = remote.store('profile/avatars', 'head.png', avatar, { width: 10, height: 10 });
    await localFile(root, 'src/config/profile.json', JSON.stringify({ name: '请叫我木头人', signature: '吾生君未生，君生吾已老', bio: '原简介', homeLabel: '个人手记', copyrightStartYear: 2026, authorUrl: null, sameAs: [], seo: { description: null, allowIndexing: true }, avatars: { head: avatarRef } }));
    const synced = await syncStorage(root, config);
    const result = await restoreStorage(root, config, synced.checkpoint, 'recovered');
    expect(result.state).toBe('verified');
    const target = path.join(root, 'recovered'), recovered = await readToyRecord(target, id);
    expect(recovered.cover).toBe(`.blog-store/works/${id}/cover.png`);
    expect(await readFile(await localToyFile(target, recovered.cover))).toEqual(cover);
    expect(await readFile(await localToyFile(target, recovered.video))).toEqual(video);
    expect(await readFile(path.join(target, `.blog-store/recovery-originals/${synced.checkpoint}/content/toys/${id}/toy.yaml`), 'utf8')).toBe(raw);
    expect(await readFile(path.join(target, 'public/media/profile', `${avatarRef.sha256}.png`))).toEqual(avatar);
    expect(await exists(path.join(target, 'RECOVERY-INCOMPLETE.json'))).toBe(false);
  });
});
