import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sha256 } from '../../src/lib/blog/files';
import { configSchema } from '../../src/lib/blog/schema';
import { YanduStorage, uploadFile } from './yandu';

type Entry = { id: string; parentId: string; name: string; kind: 'folder' | 'file'; versionId: string; deletedAt: number; generation: number; size: number };
type Upload = { id: string; objectId: string; versionId: string; parentId: string; name: string; length: number; bytes: Buffer; state: string };
const roots: string[] = [];
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    if (!server.listening) { resolve(); return; }
    server.closeAllConnections(); server.close((error) => error ? reject(error) : resolve());
  })));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function body(request: IncomingMessage) {
  const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks);
}
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value));
}
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sachi-yandu-'))); roots.push(root);
  const entries = new Map<string, Entry>(), uploads = new Map<string, Upload>(), keys = new Map<string, string>();
  const calls: { method: string; pathname: string; offset?: number }[] = [];
  const failure = { folder: '', raceFolder: '', offline: false, uploadIntent: false, postResponse: false, patchResponse: false, corruptRead: false };
  let nextId = 0, createFolderCount = 0, createIntentCount = 0, downloadCount = 0;
  const prefix = '/storage/v1/projects/test-blog';
  function folder(parentId: string, name: string) {
    const value: Entry = { id: `folder-${++nextId}`, parentId, name, kind: 'folder', versionId: '', deletedAt: 0, generation: 1, size: 0 };
    entries.set(value.id, value); return value;
  }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url!, 'http://localhost');
      calls.push({ method: request.method!, pathname: url.pathname, ...(request.headers['upload-offset'] ? { offset: Number(request.headers['upload-offset']) } : {}) });
      if (request.headers.authorization !== 'Bearer test-secret-kept-server-side') return json(response, 401, { error: { code: 'UNAUTHORIZED' } });
      if (failure.offline) return json(response, 503, { error: { code: 'DEVICE_OFFLINE' } });
      if (url.pathname === `${prefix}/capacity`) return json(response, 200, { quotaBytes: 1024 ** 3, usedBytes: 0, reservedBytes: 0, freeBytes: 1024 ** 3 });
      if (url.pathname === `${prefix}/entries` && request.method === 'GET') {
        const items = [...entries.values()].filter((entry) => entry.parentId === (url.searchParams.get('parentId') ?? ''));
        return json(response, 200, { items, nextCursor: '' });
      }
      if (url.pathname.startsWith(`${prefix}/entries/`) && request.method === 'GET') {
        const entry = entries.get(url.pathname.slice(`${prefix}/entries/`.length));
        return json(response, entry ? 200 : 404, entry ?? { error: { code: 'NOT_FOUND' } });
      }
      if (url.pathname === `${prefix}/folders` && request.method === 'POST') {
        createFolderCount++;
        const input = JSON.parse((await body(request)).toString()) as { parentId: string; name: string };
        if (input.name === failure.folder) { failure.folder = ''; return json(response, 503, { error: { code: 'DEVICE_OFFLINE' } }); }
        if (input.name === failure.raceFolder) { failure.raceFolder = ''; folder(input.parentId, input.name); return json(response, 409, { error: { code: 'NAME_CONFLICT' } }); }
        if ([...entries.values()].some((entry) => entry.parentId === input.parentId && entry.name === input.name)) return json(response, 409, { error: { code: 'NAME_CONFLICT' } });
        return json(response, 201, folder(input.parentId, input.name));
      }
      if (url.pathname === `${prefix}/uploads` && request.method === 'POST') {
        createIntentCount++;
        if (failure.uploadIntent) return json(response, 503, { error: { code: 'DEVICE_OFFLINE' } });
        const input = JSON.parse((await body(request)).toString()) as { parentId: string; name: string; length: number };
        const key = String(request.headers['idempotency-key']);
        let id = keys.get(key);
        if (!id) {
          id = `upload-${++nextId}`; keys.set(key, id);
          uploads.set(id, { id, objectId: `object-${nextId}`, versionId: `version-${nextId}`, ...input, bytes: Buffer.alloc(0), state: 'uploading' });
        }
        const upload = uploads.get(id)!;
        return json(response, 201, { id, objectId: upload.objectId, versionId: upload.versionId, tusEndpoint: `${prefix}/tus/` });
      }
      if (url.pathname.startsWith(`${prefix}/uploads/`) && request.method === 'GET') {
        const upload = uploads.get(url.pathname.slice(`${prefix}/uploads/`.length));
        return json(response, upload ? 200 : 404, upload ? { id: upload.id, objectId: upload.objectId, versionId: upload.versionId, state: upload.state, error: '' } : { error: { code: 'NOT_FOUND' } });
      }
      if (url.pathname === `${prefix}/tus/` && request.method === 'POST') {
        const id = Buffer.from(String(request.headers['upload-metadata']).split(' ')[1], 'base64').toString();
        if (!uploads.has(id)) return json(response, 404, { error: { code: 'NOT_FOUND' } });
        if (failure.postResponse) { failure.postResponse = false; request.socket.destroy(); return; }
        response.writeHead(201, { Location: `${prefix}/tus/${id}`, 'Tus-Resumable': '1.0.0' }); response.end(); return;
      }
      if (url.pathname.startsWith(`${prefix}/tus/`)) {
        const upload = uploads.get(url.pathname.slice(`${prefix}/tus/`.length));
        if (!upload) return json(response, 404, { error: { code: 'NOT_FOUND' } });
        if (request.method === 'HEAD') { response.writeHead(200, { 'Upload-Offset': upload.bytes.length, 'Upload-Length': upload.length, 'Tus-Resumable': '1.0.0' }); response.end(); return; }
        if (request.method === 'PATCH') {
          if (Number(request.headers['upload-offset']) !== upload.bytes.length) return json(response, 409, { error: { code: 'OFFSET_CONFLICT' } });
          upload.bytes = Buffer.concat([upload.bytes, await body(request)]);
          if (upload.bytes.length === upload.length) {
            upload.state = 'READY';
            entries.set(upload.objectId, { id: upload.objectId, parentId: upload.parentId, name: upload.name, kind: 'file', versionId: upload.versionId, deletedAt: 0, generation: 1, size: upload.bytes.length });
          }
          if (failure.patchResponse) { failure.patchResponse = false; request.socket.destroy(); return; }
          response.writeHead(204, { 'Upload-Offset': upload.bytes.length, 'Tus-Resumable': '1.0.0' }); response.end(); return;
        }
      }
      if (url.pathname.startsWith(`${prefix}/objects/`) && url.pathname.endsWith('/content') && request.method === 'GET') {
        downloadCount++;
        const objectId = url.pathname.slice(`${prefix}/objects/`.length, -'/content'.length);
        const upload = [...uploads.values()].find((item) => item.objectId === objectId && item.versionId === url.searchParams.get('versionId') && item.state === 'READY');
        if (!upload) return json(response, 404, { error: { code: 'NOT_FOUND' } });
        const payload = failure.corruptRead ? Buffer.alloc(upload.bytes.length, 0x78) : upload.bytes;
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length, ETag: `"${sha256(upload.bytes)}"` }); response.end(payload); return;
      }
      return json(response, 404, { error: { code: 'NOT_FOUND' } });
    } catch (error) { json(response, 500, { error: { message: String(error) } }); }
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test listener');
  vi.stubEnv('YANDU_TEST_KEY', 'test-secret-kept-server-side');
  const config = configSchema.parse({ schemaVersion: 1, timezone: 'Asia/Shanghai', yandu: { gateway: `http://127.0.0.1:${address.port}`, projectId: 'test-blog', credentialEnv: 'YANDU_TEST_KEY' } });
  const storage = new YanduStorage(root, config);
  return { root, config, storage, entries, uploads, calls, failure, counts: () => ({ folders: createFolderCount, intents: createIntentCount, downloads: downloadCount }) };
}

describe('Yandu server storage adapter against the current public API', () => {
  it('authenticates from the private file even when the fallback environment has a different key', async () => {
    const f = await fixture();
    await mkdir(path.join(f.root, '.sachi'));
    await writeFile(path.join(f.root, '.sachi/yandu-upload.json'), JSON.stringify({ schemaVersion: 1, uploadKey: 'test-secret-kept-server-side' }));
    vi.stubEnv('YANDU_TEST_KEY', 'incorrect-environment-key');
    expect((await new YanduStorage(f.root, f.config).initialize()).projectId).toBe('test-blog');
  });

  it('reuses initialized directories and persists project binding and structure version', async () => {
    const f = await fixture();
    const first = await f.storage.initialize();
    expect(Object.keys(first.folders).sort()).toEqual(['archives', 'articles', 'profile', 'profile/avatars', 'works']);
    const second = await new YanduStorage(f.root, f.config).initialize();
    expect(second).toEqual(first); expect(f.counts().folders).toBe(5);
    expect(await f.storage.saved()).toMatchObject({ projectId: 'test-blog', schemaVersion: 1, folders: first.folders });
    expect(await readFile(path.join(f.root, '.blog-store/yandu/state.json'), 'utf8')).not.toContain('test-secret');
  });

  it('resolves a concurrent create conflict by querying and reusing the winning folder', async () => {
    const f = await fixture(); f.failure.raceFolder = 'articles';
    const initialized = await f.storage.initialize();
    expect(initialized.folders.articles).toBe([...f.entries.values()].find((entry) => entry.name === 'articles')!.id);
    expect([...f.entries.values()].filter((entry) => entry.name === 'articles')).toHaveLength(1);
    expect(f.calls.filter((call) => call.pathname.endsWith('/entries') && call.method === 'GET').length).toBeGreaterThan(5);
  });

  it('resumes a partial initialization after a service failure without duplicating directories', async () => {
    const f = await fixture(); f.failure.folder = 'works';
    await expect(f.storage.initialize()).rejects.toMatchObject({ status: 'STORAGE_UNAVAILABLE' });
    const partial = (await f.storage.saved()).folders;
    expect(Object.keys(partial)).toEqual(['profile', 'profile/avatars', 'articles']);
    const initialized = await new YanduStorage(f.root, f.config).initialize();
    expect(initialized.folders.profile).toBe(partial.profile);
    expect([...f.entries.values()]).toHaveLength(5);
  });

  it('retries a lost Tus creation response and hashes the downloaded READY version before saving', async () => {
    const f = await fixture(); await f.storage.initialize(); f.failure.postResponse = true;
    const bytes = Buffer.from('the bytes have reached durable Yandu storage');
    await expect(f.storage.upload('articles/article-1', 'example.txt', bytes)).rejects.toMatchObject({ status: 'STORAGE_UNAVAILABLE' });
    expect(Object.keys((await f.storage.saved()).objects)).toHaveLength(0);
    const ref = await new YanduStorage(f.root, f.config).upload('articles/article-1', 'example.txt', bytes);
    expect(ref).toMatchObject({ projectId: 'test-blog', sha256: sha256(bytes), bytes: bytes.length, mime: 'text/plain' });
    expect(f.counts()).toMatchObject({ intents: 1, downloads: 1 });
    expect(f.calls.some((call) => call.method === 'HEAD' && call.pathname.includes('/tus/'))).toBe(true);
    expect(Object.values((await f.storage.saved()).uploads)[0].state).toBe('saved');
  });

  it('resumes a lost PATCH response with HEAD and sends only the remaining bytes', async () => {
    const f = await fixture(); await f.storage.initialize(); f.failure.patchResponse = true;
    const bytes = Buffer.alloc(4 * 1024 * 1024 + 73, 0x61);
    await expect(f.storage.upload('articles/article-1', 'clip.mp4', bytes, { duration: 3 })).rejects.toMatchObject({ status: 'STORAGE_UNAVAILABLE' });
    expect([...f.uploads.values()][0].bytes.length).toBe(4 * 1024 * 1024);
    const ref = await new YanduStorage(f.root, f.config).upload('articles/article-1', 'clip.mp4', bytes, { duration: 3 });
    expect(ref.sha256).toBe(sha256(bytes)); expect(ref.duration).toBe(3);
    expect(f.calls.filter((call) => call.method === 'PATCH').map((call) => call.offset)).toEqual([0, 4 * 1024 * 1024]);
    expect(f.calls.filter((call) => call.method === 'HEAD')).toHaveLength(2);
    expect(f.counts()).toMatchObject({ intents: 1, downloads: 1 });
  });

  it('refuses to save a READY upload whose downloaded content has the wrong SHA256', async () => {
    const f = await fixture(); await f.storage.initialize(); f.failure.corruptRead = true;
    const bytes = Buffer.from('private original');
    await expect(f.storage.upload('archives', 'draft.md', bytes)).rejects.toMatchObject({ status: 'INTEGRITY_FAILED' });
    expect(Object.keys((await f.storage.saved()).objects)).toHaveLength(0);
    expect(Object.values((await f.storage.saved()).uploads)[0].state).toBe('verifying');
    expect(await readFile(path.join(f.root, '.blog-store/yandu/originals', sha256(bytes)))).toEqual(bytes);
    f.failure.corruptRead = false;
    const ref = await f.storage.upload('archives', 'draft.md', bytes);
    expect(ref.sha256).toBe(sha256(bytes)); expect(f.counts().intents).toBe(1);
  });

  it('keeps selected originals, a protected copy and pending state after a failed upload request', async () => {
    const f = await fixture(); await f.storage.initialize(); f.failure.uploadIntent = true;
    const source = path.join(f.root, 'working-copy', 'private.md'), bytes = Buffer.from('a draft kept offline');
    await mkdir(path.dirname(source)); await writeFile(source, bytes);
    await expect(uploadFile(f.root, f.config, 'archives', source)).rejects.toMatchObject({ status: 'STORAGE_UNAVAILABLE' });
    expect(await readFile(source)).toEqual(bytes);
    expect(await readFile(path.join(f.root, '.blog-store/yandu/originals', sha256(bytes)))).toEqual(bytes);
    expect(Object.values((await f.storage.saved()).uploads)[0].state).toBe('pending');
    expect(Object.keys((await f.storage.saved()).objects)).toHaveLength(0);
    f.failure.uploadIntent = false;
    const ref = await uploadFile(f.root, f.config, 'archives', source);
    expect(ref.sha256).toBe(sha256(bytes));
    const recovered = path.join(f.root, 'recovered', 'draft.md');
    await f.storage.download(ref, recovered); expect(await readFile(recovered)).toEqual(bytes);
  });

  it('persists a protected copy and pending intent before the first directory request fails offline', async () => {
    const f = await fixture(); f.failure.offline = true;
    const bytes = Buffer.from('new local work while the storage device is offline');
    await expect(f.storage.upload('archives/new-work', 'draft.md', bytes)).rejects.toMatchObject({ status: 'STORAGE_UNAVAILABLE' });
    expect(await readFile(path.join(f.root, '.blog-store/yandu/originals', sha256(bytes)))).toEqual(bytes);
    expect(Object.values((await f.storage.saved()).uploads)[0].state).toBe('pending');
    expect(f.counts().intents).toBe(0);
    f.failure.offline = false;
    const ref = await new YanduStorage(f.root, f.config).upload('archives/new-work', 'draft.md', bytes);
    expect(ref.sha256).toBe(sha256(bytes));
  });
});
