import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Configuration, StorageApi, type Entry, type IntentResponse } from '@yandu/storage-server';
import { z } from 'zod';
import sharp from 'sharp';
import { run } from './process';
import { BlogError, exists, safeDirectory, safeFile, sha256, withLock, writeJson, readJson } from '../../src/lib/blog/files';
import type { BlogConfig } from '../../src/lib/blog/schema';
import { resourceRefSchema, type ResourceRef } from '../../src/lib/blog/yandu';
import { storePath } from './config';
import { loadUploadCredential } from './credentials';

const stateSchema = z.object({
  schemaVersion: z.literal(1), projectId: z.string(),
  folders: z.record(z.string(), z.string()),
  objects: z.record(z.string(), resourceRefSchema),
  uploads: z.record(z.string(), z.object({ key: z.string(), intent: z.object({ id: z.string(), objectId: z.string().optional(), versionId: z.string().optional(), tusEndpoint: z.string() }).optional(), location: z.string().optional(), state: z.enum(['pending', 'transferring', 'verifying', 'saved']), error: z.string().optional() })),
});
type StorageState = z.infer<typeof stateSchema>;
export function mimeFor(filename: string): string {
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.json': 'application/json', '.md': 'text/markdown', '.yaml': 'application/yaml', '.yml': 'application/yaml', '.txt': 'text/plain', '.pdf': 'application/pdf', '.zip': 'application/zip', '.csv': 'text/csv' } as Record<string, string>)[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
}
async function* streamChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try { while (true) { const { done, value } = await reader.read(); if (done) return; yield value; } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function httpStatus(error: unknown) { return (error as { response?: Response })?.response?.status; }
function storageFailure(error: unknown): never {
  if (error instanceof BlogError) throw error;
  const status = httpStatus(error);
  throw new BlogError(`Yandu ${status ? `返回 HTTP ${status}` : '连接或传输失败'}；本地原件与上传记录已保留，可恢复后重试。`, status === 409 ? 4 : 7, status === 409 ? 'CONFLICT' : 'STORAGE_UNAVAILABLE');
}
export class YanduStorage {
  readonly api: StorageApi;
  readonly projectId: string;
  readonly gateway: string;
  private readonly key: string;
  constructor(readonly root: string, config: BlogConfig) {
    if (!config.yandu) throw new BlogError('尚未配置 Yandu；运行 blog init，在向导中绑定专用项目。', 2);
    this.projectId = config.yandu.projectId;
    this.gateway = config.yandu.gateway.replace(/\/$/, '');
    this.key = loadUploadCredential(root, config.yandu);
    this.api = new StorageApi(new Configuration({ basePath: this.gateway, accessToken: this.key, fetchApi: (url, init) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(60_000) }) }));
  }
  private stateFile() { return storePath(this.root, 'yandu', 'state.json'); }
  private async load(): Promise<StorageState> {
    await safeDirectory(this.root, '.blog-store/yandu');
    if (await exists(this.stateFile())) await safeFile(this.root, '.blog-store/yandu/state.json');
    const state = await exists(this.stateFile()) ? stateSchema.parse(await readJson(this.stateFile())) : { schemaVersion: 1 as const, projectId: this.projectId, folders: {}, objects: {}, uploads: {} };
    if (state.projectId !== this.projectId) throw new BlogError('当前 Yandu 绑定属于另一项目；保留映射并使用独立工作目录，禁止覆盖绑定。', 4);
    return state;
  }
  private async save(state: StorageState) { await writeJson(this.stateFile(), state); }
  async list(parentId: string) {
    const entries: Entry[] = []; let cursor: string | undefined; const cursors = new Set<string>();
    do {
      const page = await this.api.listEntries({ projectId: this.projectId, parentId, cursor, limit: 200 });
      entries.push(...page.items); cursor = page.nextCursor || undefined;
      if (cursor && cursors.has(cursor)) throw new BlogError('Yandu 目录分页游标重复。', 7);
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return entries;
  }
  private async folder(state: StorageState, logical: string): Promise<string> {
    if (!logical) return '';
    if (logical.split('/').some((part) => !part || part === '.' || part === '..' || !/^[\p{L}\p{N}_.-]+$/u.test(part))) throw new BlogError('不安全的 Yandu 逻辑目录。', 2);
    let parentId = '', prefix = '';
    for (const name of logical.split('/')) {
      prefix = prefix ? `${prefix}/${name}` : name;
      if (state.folders[prefix]) {
        const existing = await this.api.getEntry({ projectId: this.projectId, entryId: state.folders[prefix] });
        if (existing.kind !== 'folder' || existing.parentId !== parentId || existing.name !== name || existing.deletedAt) throw new BlogError(`Yandu 绑定目录发生变化：${prefix}`, 4);
      } else {
        let entry = (await this.list(parentId)).find((item) => item.name === name && !item.deletedAt);
        if (!entry) {
          try { entry = await this.api.createFolder({ projectId: this.projectId, folderInput: { parentId, name } }); }
          catch (error) { if (httpStatus(error) !== 409) throw error; entry = (await this.list(parentId)).find((item) => item.name === name && !item.deletedAt); }
        }
        if (!entry || entry.kind !== 'folder') throw new BlogError(`Yandu 同名条目不是可复用目录：${prefix}`, 4);
        state.folders[prefix] = entry.id; await this.save(state);
      }
      parentId = state.folders[prefix];
    }
    return parentId;
  }
  async initialize() {
    try {
      return await withLock(storePath(this.root, 'yandu.lock'), async () => {
        const capacity = await this.api.getCapacity({ projectId: this.projectId });
        const state = await this.load();
        for (const logical of ['profile/avatars', 'articles', 'works', 'archives']) await this.folder(state, logical);
        await this.save(state);
        return { schemaVersion: state.schemaVersion, projectId: state.projectId, folders: state.folders, capacity };
      });
    } catch (error) { storageFailure(error); }
  }
  async check() {
    try { return { projectId: this.projectId, capacity: await this.api.getCapacity({ projectId: this.projectId }), capabilities: await this.api.getCapabilities({ projectId: this.projectId }) }; }
    catch (error) { storageFailure(error); }
  }
  private tusUrl(value: string, endpoint = false) {
    const url = new URL(value, this.gateway);
    const prefix = `/storage/v1/projects/${encodeURIComponent(this.projectId)}/tus/`;
    if (url.origin !== new URL(this.gateway).origin || !url.pathname.startsWith(prefix) || !endpoint && url.pathname === prefix || url.search || url.hash || url.username || url.password) throw new BlogError('Yandu 返回了项目范围外的 Tus 地址。', 7);
    return url.href;
  }
  private async tus(value: string, method: string, headers: Record<string, string>, body?: Uint8Array) {
    const response = await fetch(this.tusUrl(value, method === 'POST'), { method, headers: { Authorization: `Bearer ${this.key}`, 'Tus-Resumable': '1.0.0', ...headers }, body: body === undefined ? undefined : Buffer.from(body), redirect: 'error', signal: AbortSignal.timeout(60_000) });
    if (!response.ok) { await response.body?.cancel(); throw new BlogError(`Yandu Tus 返回 HTTP ${response.status}；保留传输记录，稍后重试。`, response.status === 409 ? 4 : 7); }
    return response;
  }
  async verify(ref: ResourceRef) {
    resourceRefSchema.parse(ref);
    if (ref.projectId !== this.projectId) throw new BlogError('资源不属于绑定项目。', 4);
    const response = await this.api.downloadObjectRaw({ projectId: this.projectId, objectId: ref.objectId, versionId: ref.versionId });
    const hash = createHash('sha256'); let bytes = 0;
    if (!response.raw.body) throw new BlogError('Yandu 返回空响应流。', 7);
    for await (const chunk of streamChunks(response.raw.body)) { bytes += chunk.length; hash.update(chunk); }
    if (bytes !== ref.bytes || hash.digest('hex') !== ref.sha256) throw new BlogError('Yandu 持久文件摘要或大小不一致，不能标记已保存。', 3, 'INTEGRITY_FAILED');
  }
  async upload(logical: string, filename: string, bytes: Uint8Array, metadata: Partial<Pick<ResourceRef, 'width' | 'height' | 'duration'>> = {}): Promise<ResourceRef> {
    try {
      return await withLock(storePath(this.root, 'yandu.lock'), async () => {
        const state = await this.load();
        const digest = sha256(bytes); const extension = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12);
        const name = `${digest}${extension}`; const mappingKey = `${logical}/${name}`;
        if (state.objects[mappingKey]) { const ref = state.objects[mappingKey]; if (ref.sha256 !== digest || ref.bytes !== bytes.length || ref.mime !== mimeFor(filename)) throw new BlogError('Yandu 本地资源映射与原件摘要不一致。', 4); await this.verify(ref); return { ...ref, ...metadata }; }
        // Retain an independent copy before the first network transfer; never move/delete originals.
        const originals = await safeDirectory(this.root, '.blog-store/yandu/originals');
        const original = path.join(originals, digest);
        if (!await exists(original)) { const handle = await open(original, 'wx', 0o600); try { await handle.writeFile(bytes); } finally { await handle.close(); } }
        if (sha256(await readFile(await safeFile(originals, digest))) !== digest) throw new BlogError('上传保护副本摘要冲突。', 4);
        if (mimeFor(filename).startsWith('image/') && (!metadata.width || !metadata.height)) {
          const info = await sharp(original, { animated: true, limitInputPixels: 80_000_000 }).metadata();
          if (!info.width || !info.height) throw new BlogError('图片缺少尺寸，不能保存资源引用。', 3);
          metadata = { ...metadata, width: info.width, height: info.pageHeight ?? info.height };
        }
        if (mimeFor(filename).startsWith('video/') && !metadata.duration) {
          const probe = JSON.parse((await run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', original], { cwd: this.root, code: 3 })).stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number }> };
          const video = probe.streams?.find((stream) => stream.codec_type === 'video');
          const duration = Number(probe.format?.duration);
          if (!video || !Number.isFinite(duration) || duration <= 0) throw new BlogError('视频缺少有效时长，不能保存资源引用。', 3);
          metadata = { ...metadata, duration, width: video.width, height: video.height };
        }
        const upload = state.uploads[mappingKey] ?? { key: randomUUID(), state: 'pending' as const };
        state.uploads[mappingKey] = upload; await this.save(state);
        const parentId = await this.folder(state, logical);
        // Reuse independently verified content after response loss or a concurrent same-name upload.
        if (!upload.intent) {
          const existing = (await this.list(parentId)).find((entry) => entry.name === name && entry.kind === 'file' && !entry.deletedAt && entry.versionId);
          if (existing) {
            const ref = resourceRefSchema.parse({ projectId: this.projectId, objectId: existing.id, versionId: existing.versionId, sha256: digest, bytes: bytes.length, mime: mimeFor(filename), ...metadata });
            await this.verify(ref); state.objects[mappingKey] = ref; upload.state = 'saved'; await this.save(state); return ref;
          }
          upload.intent = await this.api.createUploadIntent({ projectId: this.projectId, idempotencyKey: upload.key, intent: { parentId, name, length: bytes.length, processing: { presets: [] } } });
          await this.save(state);
        }
        const intent: IntentResponse = upload.intent;
        let status = await this.api.getUploadIntent({ projectId: this.projectId, uploadId: intent.id });
        if (['failed', 'cancelled'].includes(status.state)) throw new BlogError(`Yandu 上传已${status.state}；保留原件，使用新上传计划前先核对服务端记录。`, 4);
        if (status.state !== 'READY') {
          if (!upload.location) {
            const created = await this.tus(intent.tusEndpoint, 'POST', { 'Upload-Length': String(bytes.length), 'Upload-Metadata': `intentId ${Buffer.from(intent.id).toString('base64')}` });
            const location = created.headers.get('Location'); if (!location) throw new BlogError('Tus 响应缺少 Location。', 7);
            upload.location = this.tusUrl(location); await this.save(state);
          }
          upload.state = 'transferring'; await this.save(state);
          const head = await this.tus(upload.location, 'HEAD', {});
          let offset = Number(head.headers.get('Upload-Offset'));
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length) throw new BlogError('Tus 续传偏移无效。', 7);
          while (offset < bytes.length) {
            const end = Math.min(offset + 4 * 1024 * 1024, bytes.length);
            const response = await this.tus(upload.location, 'PATCH', { 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' }, bytes.subarray(offset, end));
            const next = Number(response.headers.get('Upload-Offset'));
            if (next !== end) throw new BlogError('Tus 返回的已传输长度不一致。', 7);
            offset = next;
          }
          upload.state = 'verifying'; await this.save(state);
          for (let attempt = 0; attempt < 60; attempt++) {
            status = await this.api.getUploadIntent({ projectId: this.projectId, uploadId: intent.id });
            if (status.state === 'READY' || ['failed', 'cancelled'].includes(status.state)) break;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        if (status.state !== 'READY') throw new BlogError('Yandu 尚未 READY；不能当成持久保存完成，稍后重试。', 7, 'PENDING');
        const ref = resourceRefSchema.parse({ projectId: this.projectId, objectId: status.objectId, versionId: status.versionId, sha256: digest, bytes: bytes.length, mime: mimeFor(filename), ...metadata });
        await this.verify(ref); upload.state = 'saved'; delete upload.error; state.objects[mappingKey] = ref; await this.save(state); return ref;
      });
    } catch (error) { storageFailure(error); }
  }
  async download(ref: ResourceRef, destination: string) {
    resourceRefSchema.parse(ref);
    if (ref.projectId !== this.projectId) throw new BlogError('恢复资源不属于绑定项目。', 4);
    const response = await this.api.downloadObjectRaw({ projectId: this.projectId, objectId: ref.objectId, versionId: ref.versionId });
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.part-${randomUUID()}`;
    const hash = createHash('sha256'); let bytes = 0;
    const handle = await open(temporary, 'wx', 0o600);
    try {
      if (!response.raw.body) throw new BlogError('Yandu 返回空恢复流。', 7);
      for await (const chunk of streamChunks(response.raw.body)) { bytes += chunk.length; hash.update(chunk); await handle.writeFile(chunk); }
      if (bytes !== ref.bytes || hash.digest('hex') !== ref.sha256) throw new BlogError('恢复文件摘要不一致。', 3);
      await handle.close(); await rename(temporary, destination);
    } finally { await handle.close().catch(() => {}); await rm(temporary, { force: true }); }
  }
  async folders() { return (await this.load()).folders; }
  async saved() { return await this.load(); }
}
export async function uploadImmutable(root: string, config: BlogConfig, logicalFolder: string, filename: string, bytes: Uint8Array, metadata: Partial<Pick<ResourceRef, 'width' | 'height' | 'duration'>> = {}) {
  return await new YanduStorage(root, config).upload(logicalFolder, filename, bytes, metadata);
}
// Protect caller-owned paths before reading and uploading (used by CLI selections).
export async function uploadFile(root: string, config: BlogConfig, logical: string, filename: string) {
  const directory = path.dirname(path.resolve(filename)); const source = await safeFile(directory, path.basename(filename));
  return await uploadImmutable(root, config, logical, path.basename(source), await readFile(source));
}
