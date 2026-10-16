import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { exists, sha256, stableJson, walk, writeJson } from '../../src/lib/blog/files';
import { defaultConfig, postSchema, snapshotSchema, type Manifest, type Snapshot } from '../../src/lib/blog/schema';
import { resourceUrl, type ResourceRef } from '../../src/lib/blog/yandu';
import type { SourcePost } from '../../src/lib/blog/content';
import { prepareMedia } from './media';
import { createPlan } from './plan';
import { codeBaseline, readSnapshot } from './snapshot';
import { buildRelease, releaseResourceAllowlist, verifyPackage, verifySite } from './site';
import { activateRelease, deployAction, downloadRelease, remoteCurrent, uploadRelease } from './deploy';
import { importRelease } from './state';

const { upload, downloaded, verified, savedBytes } = vi.hoisted(() => ({ upload: vi.fn(), downloaded: vi.fn(), verified: vi.fn(), savedBytes: new Map<string, Uint8Array>() }));
vi.mock('./yandu', () => ({ uploadImmutable: upload, YanduStorage: class { download = downloaded; verify = verified; } }));
const temporary: string[] = [];
function ref(label: string, mime = 'image/png'): ResourceRef {
  return { projectId: 'blog-project', objectId: `object-${label}`, versionId: 'version-1', sha256: sha256(label), mime, bytes: label.length };
}
async function directory() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sachi-yandu-release-')); temporary.push(root); return root;
}
function manifest(): Manifest {
  return { schemaVersion: 1, releaseId: `r-${randomUUID()}`, baseReleaseId: null, createdAt: new Date().toISOString(), codeHash: sha256('code'), codeCommit: null, entries: [], withdrawn: [], retired: [], assets: {} };
}
async function sourceFixture(root: string, previous?: SourcePost): Promise<{ source: SourcePost; snapshot: Snapshot; bytes: Buffer }> {
  const bytes = await sharp({ create: { width: 40, height: 24, channels: 4, background: { r: previous ? 200 : 20, g: 100, b: 40, alpha: 0.6 } } }).png().toBuffer();
  const post = previous ? { ...previous.post, body: `已发布修订\n\n${previous.post.body}` } : postSchema.parse({ id: randomUUID(), slug: 'frozen-post', title: '冻结文章', date: '2026-10-16', createdAt: '2026-10-16T00:00:00Z', category: 'life', body: '![正文图片](./assets/source.png)', minutes: 1 });
  const dependencies = [{ url: './assets/source.png', file: 'assets/source.png', hash: sha256(bytes), bytes: bytes.length }];
  const media = { assets: {} };
  const revisionHash = sha256(stableJson({ post, media, dependencies }));
  const raw = previous ? '# 私有修订 Markdown' : '# 原始私有 Markdown';
  const snapshot: Snapshot = { schemaVersion: 1, revisionHash, sourcePath: 'content/生活旁白/2026-10-16/index.md', sourceHash: sha256(raw), post, media, dependencies };
  const frozen = path.join(root, '.blog-store/snapshots', revisionHash); await mkdir(path.join(frozen, 'files/assets'), { recursive: true });
  await writeFile(path.join(frozen, 'files/assets/source.png'), bytes); await writeFile(path.join(frozen, 'source.md'), raw); await writeJson(path.join(frozen, 'snapshot.json'), snapshot);
  return { snapshot, bytes, source: { post, sourcePath: snapshot.sourcePath, directory: root, raw, dependencies: dependencies.map((dependency) => ({ ...dependency, sourceFile: path.join(frozen, 'files', dependency.file) })), media, revisionHash, warnings: [], links: [] } };
}
beforeEach(() => {
  upload.mockReset(); downloaded.mockReset(); verified.mockReset(); verified.mockResolvedValue(undefined); savedBytes.clear();
  upload.mockImplementation(async (_root, _config, _folder, name: string, bytes: Uint8Array, metadata: object = {}) => {
    const resource = { projectId: 'blog-project', objectId: `object-${sha256(bytes).slice(0, 20)}`, versionId: 'version-1', sha256: sha256(bytes), mime: name.endsWith('.json') ? 'application/json' : name.endsWith('.webp') ? 'image/webp' : 'image/png', bytes: bytes.length, ...metadata };
    savedBytes.set(resourceUrl(resource), Uint8Array.from(bytes)); return resource;
  });
  downloaded.mockImplementation(async (resource: ResourceRef, destination: string) => {
    const bytes = savedBytes.get(resourceUrl(resource)); if (!bytes || sha256(bytes) !== resource.sha256) throw new Error('mock Yandu bytes unavailable');
    await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes);
  });
});
afterEach(async () => { for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('Yandu immutable publication references', () => {
  it('keeps legacy snapshot hashes and uploads only final display objects with dimensions', async () => {
    const root = await directory(); const { source, snapshot, bytes } = await sourceFixture(root);
    expect(snapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect((await readSnapshot(root, snapshot.revisionHash)).revisionHash).toBe(source.revisionHash);
    const config = { ...defaultConfig('Asia/Shanghai'), yandu: { gateway: 'http://127.0.0.1:19091', projectId: 'blog-project', credentialEnv: 'YANDU_UPLOAD_KEY', credentialFile: '.sachi/yandu-upload.json' } };
    const assets = await prepareMedia(root, config, snapshot, path.join(root, 'public'));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][2]).toBe(`articles/${snapshot.post.id}`);
    const resource = assets['./assets/source.png'].resources![0];
    expect(resource).toMatchObject({ width: 40, height: 24, bytes: upload.mock.calls[0][4].length, sha256: sha256(upload.mock.calls[0][4]) });
    expect(assets['./assets/source.png'].url).toBe(resourceUrl(resource));
    expect(await readFile(source.dependencies[0].sourceFile)).toEqual(bytes);
  });
  it('retains published media versions by active owner and excludes withdrawn owners', async () => {
    const root = await directory(); const { source } = await sourceFixture(root);
    const first = createPlan(null, [source], [source], { hash: sha256('code'), commit: null }).manifest;
    const original = ref('original'); const avatar = ref('avatar');
    first.assets[source.post.id] = { './assets/source.png': { type: 'image', url: resourceUrl(original), resources: [original] } };
    first.resources = [original, avatar];
    const unchanged = createPlan(first, [], [source], { hash: first.codeHash, commit: null }).manifest;
    expect(unchanged.assets).toEqual(first.assets); expect(unchanged.assets).not.toBe(first.assets);
    const selected = createPlan(first, [source], [source], { hash: first.codeHash, commit: null }).manifest;
    expect(selected.assets).toEqual({});
    expect(selected.retainedResources).toContainEqual({ ownerId: source.post.id, resource: original });
    expect(selected.retainedResources).toContainEqual({ ownerId: 'profile', resource: avatar });
    const withdrawn = createPlan(first, [], [source], { hash: first.codeHash, commit: null }, [source.post.id]).manifest;
    const allowlist = releaseResourceAllowlist(withdrawn);
    expect(allowlist.resources).toEqual([{ ...avatar, path: resourceUrl(avatar), ownerId: 'profile' }]);
    expect(allowlist.activeOwnerIds).not.toContain(source.post.id);
  });
  it('rejects conflicting identities sharing one public path', () => {
    const release = manifest(); const original = ref('avatar');
    expect(() => releaseResourceAllowlist(release, [original, { ...original, projectId: 'another-project' }])).toThrow('多个版本身份');
  });
  it('freezes profile, reuses offline media and switches exact allowlists through local publish, rollback and withdrawal', async () => {
    const root = await directory(); await mkdir(path.join(root, 'src/config'), { recursive: true }); await mkdir(path.join(root, 'public'));
    const oldHead = ref('old-head'); const oldHalf = ref('old-half');
    await writeJson(path.join(root, 'src/config/profile.json'), { avatars: { head: oldHead, half: oldHalf } });
    const builder = `import fs from 'node:fs/promises';
const posts=JSON.parse(await fs.readFile(process.env.BLOG_CONTENT_ROOT+'/posts.json','utf8'));
const profile=JSON.parse(await fs.readFile('src/config/profile.json','utf8'));
const avatar=r=>'/resources/'+r.sha256+'/'+r.objectId+'/'+r.versionId;
await fs.mkdir('out',{recursive:true});await fs.cp('public','out',{recursive:true});
await fs.writeFile('out/index.html','<img src="'+avatar(profile.avatars.head)+'">');
await fs.mkdir('out/contents',{recursive:true});await fs.writeFile('out/contents/index.html','目录');
for(const post of posts){const d='out/article/'+post.slug;await fs.mkdir(d,{recursive:true});await fs.writeFile(d+'/index.html',Object.values(post.assets).map(a=>'<img src="'+a.url+'">').join(''));}`;
    await writeFile(path.join(root, 'src/build.mjs'), builder);
    for (const [name, value] of Object.entries({ 'package.json': '{"type":"module"}', 'package-lock.json': '{}', 'next.config.ts': 'export default {};', 'tsconfig.json': '{}', 'next-env.d.ts': '' })) await writeFile(path.join(root, name), value);
    const config = { ...defaultConfig('Asia/Shanghai'), siteAssets: [], buildCommand: ['node', 'src/build.mjs'], deploy: { type: 'local' as const, root: path.join(root, 'server') }, yandu: { gateway: 'http://127.0.0.1:19091', projectId: 'blog-project', credentialEnv: 'YANDU_UPLOAD_KEY', credentialFile: '.sachi/yandu-upload.json' } };
    config.yandu.credentialFile = path.join(root, '.sachi/private-upload.json');
    await writeJson(config.yandu.credentialFile, { schemaVersion: 1, uploadKey: 'never-freeze-this-private-key' });
    const { source } = await sourceFixture(root); const code = await codeBaseline(root, config, true);
    const frozenCode = path.join(root, '.blog-store/code', code.hash);
    expect((await walk(frozenCode)).some((file) => file.startsWith('.sachi/'))).toBe(false);
    const frozenConfig = await readFile(path.join(frozenCode, 'blog.config.json'), 'utf8');
    expect(frozenConfig).not.toContain('credentialFile');
    expect(frozenConfig).not.toContain('never-freeze-this-private-key');
    expect(frozenConfig).not.toContain(root);
    await writeJson(path.join(root, 'src/config/profile.json'), { avatars: { head: ref('unpublished-head'), half: ref('unpublished-half') } });
    const first = await buildRelease(root, config, createPlan(null, [source], [source], code).manifest);
    expect(first.manifest.resources).toEqual(expect.arrayContaining([oldHead, oldHalf]));
    expect(first.manifest.resources?.some((resource) => resource.objectId.includes('unpublished'))).toBe(false);
    const allowlist = JSON.parse(await readFile(path.join(first.directory, 'resource-allowlist.json'), 'utf8'));
    expect(allowlist.resources).toContainEqual({ ...oldHead, path: resourceUrl(oldHead), ownerId: 'profile' });
    expect(await readFile(path.join(first.directory, 'site/index.html'), 'utf8')).toContain(resourceUrl(oldHead));
    await verifyPackage(first.directory);
    await uploadRelease(root, config, first.manifest, first.directory); await activateRelease(root, config, first.manifest);
    const cloudPackage = path.join(config.deploy.root, 'releases', first.manifest.releaseId);
    const cloudFiles = await walk(cloudPackage);
    expect(cloudFiles).not.toContain('code/code.json');
    expect(cloudFiles.some((file) => file.startsWith('snapshots/') || file.startsWith('code/') || file.endsWith('/source.md'))).toBe(false);
    expect(cloudFiles).toContain('yandu-recovery.json');
    const recovered = await downloadRelease(root, config, first.manifest.releaseId, path.join(root, 'recovered'));
    await verifyPackage(recovered);
    expect(await readFile(path.join(recovered, 'snapshots', source.revisionHash, 'source.md'), 'utf8')).toBe(source.raw);
    expect(await readFile(path.join(recovered, 'code/src/config/profile.json'), 'utf8')).toContain('object-old-head');
    expect(await exists(path.join(recovered, 'yandu-recovery.json'))).toBe(false);
    const imported = path.join(root, 'restored-writing'); await mkdir(imported);
    await importRelease(imported, recovered, first.manifest);
    expect((await readSnapshot(imported, source.revisionHash)).sourceHash).toBe(sha256(source.raw));
    expect(downloaded).toHaveBeenCalled();
    const currentAllowlist = async () => JSON.parse(await readFile(path.join(await realpath(path.join(config.deploy.root, 'current')), '../resource-allowlist.json'), 'utf8')) as ReturnType<typeof releaseResourceAllowlist>;
    expect((await currentAllowlist()).releaseId).toBe(first.manifest.releaseId);
    const uploadWhenOnline = upload.getMockImplementation()!;
    upload.mockClear(); upload.mockRejectedValue(new Error('offline'));
    const second = await buildRelease(root, config, createPlan(first.manifest, [], [source], code).manifest);
    expect(upload).not.toHaveBeenCalled();
    expect(second.manifest.assets[source.post.id]).toEqual(first.manifest.assets[source.post.id]);
    await verifyPackage(second.directory);
    upload.mockImplementation(uploadWhenOnline);
    verified.mockRejectedValueOnce(new Error('frozen resource unavailable'));
    await expect(uploadRelease(root, config, second.manifest, second.directory)).rejects.toThrow('frozen resource unavailable');
    expect((await remoteCurrent(root, config))?.releaseId).toBe(first.manifest.releaseId);
    await uploadRelease(root, config, second.manifest, second.directory); await activateRelease(root, config, second.manifest);
    const { source: revision } = await sourceFixture(root, source);
    const third = await buildRelease(root, config, createPlan(second.manifest, [revision], [revision], code).manifest);
    await uploadRelease(root, config, third.manifest, third.directory); await activateRelease(root, config, third.manifest);
    const oldResource = first.manifest.assets[source.post.id]['./assets/source.png'].resources![0];
    const newResource = third.manifest.assets[source.post.id]['./assets/source.png'].resources![0];
    expect(resourceUrl(newResource)).not.toBe(resourceUrl(oldResource));
    expect((await currentAllowlist()).resources.map((resource) => resource.path)).toEqual(expect.arrayContaining([resourceUrl(oldResource), resourceUrl(newResource)]));
    await deployAction(root, config, 'rollback', { releaseId: first.manifest.releaseId, baseReleaseId: third.manifest.releaseId, operationId: `r-${randomUUID()}` });
    expect((await remoteCurrent(root, config))?.releaseId).toBe(first.manifest.releaseId);
    expect((await currentAllowlist()).resources.some((resource) => resource.path === resourceUrl(newResource))).toBe(false);
    const withdrawal = await buildRelease(root, config, createPlan(first.manifest, [], [revision], code, [source.post.id]).manifest);
    await uploadRelease(root, config, withdrawal.manifest, withdrawal.directory); await activateRelease(root, config, withdrawal.manifest);
    expect((await currentAllowlist()).activeOwnerIds).not.toContain(source.post.id);
    expect((await currentAllowlist()).resources.some((resource) => resource.ownerId === source.post.id)).toBe(false);
    expect((await remoteCurrent(root, config))?.entries).toEqual([]);
  }, 20_000);
  it('checks extensionless resource URLs and srcset against exact manifest references', async () => {
    const root = await directory(); await mkdir(path.join(root, 'contents'));
    const release = manifest(); const resource = ref('public'); release.resources = [resource];
    await writeFile(path.join(root, 'index.html'), `<img src="${resourceUrl(resource)}" srcset="${resourceUrl(resource)} 40w">`);
    await writeFile(path.join(root, 'contents/index.html'), '目录'); await writeFile(path.join(root, 'release-marker.json'), '{}');
    await expect(verifySite(root, release)).resolves.toBeUndefined();
    await writeFile(path.join(root, 'index.html'), `<img src="${resourceUrl(resource)}" srcset="${resourceUrl(ref('private'))} 40w">`);
    await expect(verifySite(root, release)).rejects.toThrow('不在发布清单');
    await cp(path.join(root, 'release-marker.json'), path.join(root, 'resource-allowlist.json'));
    await expect(verifySite(root, release)).rejects.toThrow('私有清单');
  });
});
