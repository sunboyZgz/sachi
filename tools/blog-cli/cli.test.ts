import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { markdownReferences, readSourcePost, scanContent, splitDocument } from '../../src/lib/blog/content';
import { exists, readJson, sha256, walk, withLock, writeJson } from '../../src/lib/blog/files';
import { defaultConfig, type BlogConfig, type Manifest } from '../../src/lib/blog/schema';
import { loadConfig, storePath } from './config';
import { newPost, editMeta } from './writing';
import { articleStates, createPlan, validateArticleLinks } from './plan';
import { readSnapshot, saveSnapshot, codeBaseline, cacheCurrent } from './snapshot';
import { buildRelease, verifyPackage } from './site';
import { activateRelease, deployAction, downloadRelease, remoteCurrent, shellQuote, uploadRelease } from './deploy';
import { backupPlan, restoreGit, saveReleaseToGit, syncContent } from './git';
import { run } from './process';
import { prepareMedia, validateMedia } from './media';

const hasVideoTools = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const cliFile = fileURLToPath(new URL('./index.ts', import.meta.url));
const tsxFile = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));

const temporary: string[] = [];
const fakeBuilder = `import fs from 'node:fs/promises';
const posts=JSON.parse(await fs.readFile(process.env.BLOG_CONTENT_ROOT+'/posts.json','utf8'));
await fs.mkdir('out',{recursive:true}); await fs.cp('public','out',{recursive:true});
await fs.mkdir('out/_next/static/chunks',{recursive:true}); await fs.writeFile('out/_next/static/chunks/fixture.js',process.env.BLOG_ASSET_PREFIX);
await fs.writeFile('out/index.html','<h1>请叫我木头人</h1>');
await fs.mkdir('out/contents',{recursive:true}); await fs.writeFile('out/contents/index.html',posts.map(p=>p.title).join(' | '));
for(const p of posts){ const dir='out/article/'+p.slug; await fs.mkdir(dir,{recursive:true}); await fs.writeFile(dir+'/index.html','<h1>'+p.title+'</h1>'+p.body+Object.values(p.assets).filter(a=>a.url.startsWith('/media/')).map(a=>'<a href="'+a.url+'">资源</a>').join('')); }
`;
async function fixture() {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sachi-cli-test-'))); temporary.push(parent);
  const root = path.join(parent, 'project'); await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'content')); await mkdir(path.join(root, 'public'));
  await writeFile(path.join(root, 'src', 'build-fixture.mjs'), fakeBuilder);
  for (const [file, bytes] of Object.entries({ 'package.json': '{"type":"module"}', 'package-lock.json': '{}', 'next.config.ts': 'export default {};', 'tsconfig.json': '{}', 'next-env.d.ts': '' })) await writeFile(path.join(root, file), bytes);
  const config: BlogConfig = { ...defaultConfig('Asia/Shanghai'), siteAssets: [], buildCommand: ['node', 'src/build-fixture.mjs'], deploy: { type: 'local', root: path.join(parent, 'server') } };
  return { root, config, parent };
}
async function article(root: string, config: BlogConfig, title: string, slug = title.toLowerCase()) {
  const created = await newPost(root, config, { category: '生活旁白', title, slug, now: new Date('2026-10-02T15:00:00Z') });
  const file = path.join(root, created.file);
  const png = await sharp({ create: { width: 10, height: 8, channels: 4, background: { r: 20, g: 100, b: 40, alpha: 0.6 } } }).png().toBuffer();
  await writeFile(path.join(path.dirname(file), 'assets', 'cover.png'), png);
  const raw = await readFile(file, 'utf8');
  await writeFile(file, raw.replace('在这里写正文。', `${title}@v1\n\n![封面](./assets/cover.png)`));
  return await readSourcePost(root, created.file, config);
}
async function publishFixture(root: string, config: BlogConfig, selected: Awaited<ReturnType<typeof article>>[], current: Manifest | null = null) {
  const baseline = await codeBaseline(root, config, true);
  const plan = createPlan(current, selected, (await scanContent(root, config)).posts, baseline);
  for (const source of selected) await saveSnapshot(root, config, source);
  const built = await buildRelease(root, config, plan.manifest);
  await uploadRelease(root, config, built.manifest, built.directory);
  await activateRelease(root, config, built.manifest);
  return built;
}
function unsafeArchive(name: string, type = '0') {
  const header = Buffer.alloc(512);
  header.write(name, 0); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write('00000000000\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156); header.write(type, 156);
  if (type === '2') header.write('../escape.txt', 157);
  header.write('ustar\0', 257); header.write('00', 263);
  const checksum = header.reduce((total, value) => total + value, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
  return Buffer.concat([header, Buffer.alloc(1024)]);
}
afterEach(async () => { for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true }); });

describe('local writing and shared content adapter', () => {
  it('checks the public profile without requiring one in compatibility projects', async () => {
    const { root } = await fixture();
    await expect(loadConfig(root)).resolves.toBeDefined();
    const profile = JSON.parse(await readFile(fileURLToPath(new URL('../../src/config/profile.json', import.meta.url)), 'utf8'));
    await mkdir(path.join(root, 'src/config'));
    await writeJson(path.join(root, 'src/config/profile.json'), { ...profile, name: '' });
    await expect(loadConfig(root)).rejects.toThrow('公开个人配置无效');
    await writeJson(path.join(root, 'src/config/profile.json'), { ...profile, name: '本地作者' });
    await expect(loadConfig(root)).resolves.toBeDefined();
  });
  it('creates concurrent same-day posts without collisions and serializes punctuation safely', async () => {
    const { root, config } = await fixture();
    const results = await Promise.all(Array.from({ length: 3 }, (_, i) => newPost(root, config, { category: '蘸豆！！', title: `标题: "${i}"\n第二行`, now: new Date('2026-10-02T16:30:00Z') })));
    expect(new Set(results.map((item) => item.id)).size).toBe(3);
    expect(results.map((item) => item.file).sort()).toEqual(['content/蘸豆！！/2026-10-03-02/index.md', 'content/蘸豆！！/2026-10-03-03/index.md', 'content/蘸豆！！/2026-10-03/index.md'].sort());
    const scan = await scanContent(root, config);
    expect(scan.issues).toEqual([]); expect(scan.posts[0].post.category).toBe('learn'); expect(scan.posts[0].post.minutes).toBeGreaterThan(0);
  });
  it('preserves YAML comments and unrelated metadata', async () => {
    const { root, config } = await fixture(); const source = await article(root, config, 'A');
    const file = path.join(root, source.sourcePath);
    await writeFile(file, (await readFile(file, 'utf8')).replace('title: A', 'title: A # 保留标题注释\ncustom: 保留自定义字段'));
    await editMeta(root, source.sourcePath, { tags: ['新标签'] });
    const edited = await readFile(file, 'utf8');
    expect(edited).toContain('# 保留标题注释'); expect(edited).toContain('custom: 保留自定义字段'); expect(splitDocument(edited).data.tags).toEqual(['新标签']);
  });
  it('leaves body bytes, CRLF, BOM and Markdown hard breaks untouched during metadata edits', async () => {
    const { root, config } = await fixture(); const source = await article(root, config, 'A');
    const body = '\r\n\r\n文字末尾两个空格  \r\n\r\n```text\r\n代码里的空格  \r\n```\r\n\r\n';
    const header = source.raw.slice(0, source.raw.length - splitDocument(source.raw).bodyRaw.length).replaceAll('\n', '\r\n');
    const file = path.join(root, source.sourcePath); await writeFile(file, `\uFEFF${header}${body}`);
    await editMeta(root, source.sourcePath, { summary: '只改摘要' });
    const edited = await readFile(file, 'utf8');
    expect(edited.startsWith('\uFEFF---\r\n')).toBe(true); expect(splitDocument(edited).bodyRaw).toBe(body);
    expect(edited.replaceAll('\r\n', '')).not.toContain('\n');
  });
  it('uses template defaults without reusing template identity or fixture flags', async () => {
    const { root, config } = await fixture(); await mkdir(path.join(root, 'templates'));
    await writeFile(path.join(root, 'templates', 'post.md'), '---\nid: '+randomUUID()+'\ntitle: 旧标题\nslug: old\ncreatedAt: "2020-01-01T00:00:00Z"\ncategory: life\nfixture: true\ntags: [模板]\nstatus: 小实验\n---\n\n## 模板正文\n\n正文  \n');
    const created = await newPost(root, config, { category: '闲暇娱乐', title: '新标题', slug: 'template-post', now: new Date('2026-10-02T15:00:00Z') });
    const post = (await readSourcePost(root, created.file, config)).post;
    expect(post.id).toBe(created.id); expect(post.slug).toBe('template-post'); expect(post.title).toBe('新标题');
    expect(post.createdAt).toBe('2026-10-02T15:00:00.000Z'); expect(post.category).toBe('play'); expect(post.fixture).toBe(false);
    expect(post.tags).toEqual(['模板']); expect(post.status).toBe('小实验'); expect(post.body).toContain('模板正文');
  });
  it('finds reference images, ignores code examples and rejects HTML', () => {
    expect(markdownReferences('![图][asset]\n\n[asset]: ./assets/a.png\n\n```md\n![不引用](./assets/private.png)\n```')).toEqual(['./assets/a.png']);
    expect(() => markdownReferences('<video src="a.mp4"></video>')).toThrow('原始 HTML');
  });
  it('rejects path traversal, symlink assets and duplicate identities', async () => {
    const { root, config } = await fixture(); const source = await article(root, config, 'A'); const file = path.join(root, source.sourcePath);
    await writeFile(file, source.raw.replace('./assets/cover.png', './assets/../../package.json'));
    expect((await scanContent(root, config)).issues[0].message).toMatch(/路径|附件/);
    await writeFile(file, source.raw.replace('./assets/cover.png', './assets/link.png'));
    await symlink(path.join(root, 'package.json'), path.join(source.directory, 'assets', 'link.png'));
    expect((await scanContent(root, config)).issues[0].message).toContain('符号链接');
    await rm(path.join(source.directory, 'assets', 'link.png')); await writeFile(file, source.raw);
    const copy = path.join(root, 'content', '生活旁白', '2026-10-03'); await cp(source.directory, copy, { recursive: true });
    expect((await scanContent(root, config)).issues.some((issue) => issue.message.includes('id 重复'))).toBe(true);
  });
  it('keeps immutable public revision hashes separate from backup hashes', async () => {
    const { root, config } = await fixture(); const source = await article(root, config, 'A');
    const before = await backupPlan(root, config);
    await writeFile(path.join(source.directory, 'assets', 'private.txt'), '私人资料，仅备份');
    const after = await readSourcePost(root, source.sourcePath, config);
    expect(after.revisionHash).toBe(source.revisionHash);
    expect((await backupPlan(root, config)).hashes).not.toEqual(before.hashes);
    await writeFile(path.join(source.directory, 'assets', 'cover.png'), await sharp({ create: { width: 10, height: 8, channels: 4, background: 'red' } }).png().toBuffer());
    expect((await readSourcePost(root, source.sourcePath, config)).revisionHash).not.toBe(source.revisionHash);
  });
  it('reuses a semantic snapshot after comment changes or directory moves', async () => {
    const { root, config } = await fixture(); const source = await article(root, config, 'A');
    await saveSnapshot(root, config, source);
    await writeFile(path.join(root, source.sourcePath), source.raw.replace('title: A', 'title: A # 写作注释'));
    const cosmetic = await readSourcePost(root, source.sourcePath, config);
    expect(cosmetic.revisionHash).toBe(source.revisionHash); await saveSnapshot(root, config, cosmetic);
    expect((await readSnapshot(root, source.revisionHash)).post.title).toBe('A');
  });
  it('reports unresolved IDs instead of silently modifying manually written files', async () => {
    const { root, config } = await fixture(); const directory = path.join(root, 'content', '生活旁白', '2026-10-03'); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.md'), '---\ntitle: 手写\n---\n\n正文');
    expect((await scanContent(root, config)).issues[0].message).toContain('meta --init');
    await editMeta(root, 'content/生活旁白/2026-10-03', {}, true);
    expect((await scanContent(root, config)).issues).toEqual([]);
  });
});

describe('immutable release plans and isolated builds', () => {
  it('publishes B only while retaining A old text/images and excluding C and unused attachments', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A'); const b = await article(root, config, 'B');
    const first = await publishFixture(root, config, [a, b]);
    await writeFile(path.join(root, a.sourcePath), a.raw.replace('A@v1', 'A@v2 私密未发布'));
    await writeFile(path.join(a.directory, 'assets', 'cover.png'), await sharp({ create: { width: 10, height: 8, channels: 4, background: 'red' } }).png().toBuffer());
    await writeFile(path.join(root, b.sourcePath), b.raw.replace('B@v1', 'B@v2'));
    const c = await article(root, config, 'C'); await writeFile(path.join(c.directory, 'assets', 'unused.txt'), 'C_PRIVATE_UNREFERENCED');
    const b2 = await readSourcePost(root, b.sourcePath, config);
    const second = await publishFixture(root, config, [b2], first.manifest);
    const aHtml = await readFile(path.join(second.directory, 'site', 'article', 'a', 'index.html'), 'utf8');
    expect(aHtml).toContain('A@v1'); expect(aHtml).not.toContain('A@v2');
    expect(await readFile(path.join(second.directory, 'site', 'article', 'b', 'index.html'), 'utf8')).toContain('B@v2');
    expect(await exists(path.join(second.directory, 'site', 'article', 'c'))).toBe(false);
    const publicFiles = await walk(path.join(second.directory, 'site'));
    expect(publicFiles.some((file) => file.includes(c.post.id) || file.includes('unused'))).toBe(false);
    expect(second.manifest.entries.find((entry) => entry.id === a.post.id)?.revisionHash).toBe(a.revisionHash);
    const publishedImage = second.manifest.assets[a.post.id]['./assets/cover.png'];
    const metadata = await sharp(path.join(second.directory, 'site', publishedImage.url.slice(1))).metadata();
    expect(metadata.width).toBe(10); expect(metadata.height).toBe(8); expect(metadata.hasAlpha).toBe(true);
    expect((await remoteCurrent(root, config))?.releaseId).toBe(second.manifest.releaseId);
    const sharedOld = path.join(config.deploy!.root, 'shared', first.manifest.assets[a.post.id]['./assets/cover.png'].url.slice(1));
    expect(await exists(sharedOld)).toBe(true);
    expect(await readFile(path.join(config.deploy!.root, 'shared', 'versions', first.manifest.releaseId, '_next/static/chunks/fixture.js'), 'utf8')).toBe(`/versions/${first.manifest.releaseId}`);
    expect(await exists(path.join(config.deploy!.root, 'shared', 'versions', second.manifest.releaseId, '_next/static/chunks/fixture.js'))).toBe(true);
  });
  it('does not treat local deletion as withdrawal and preserves first publication time', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A'); const first = await publishFixture(root, config, [a]);
    const plan = createPlan(first.manifest, [], [], { hash: first.manifest.codeHash, commit: null });
    expect(plan.manifest.entries).toEqual(first.manifest.entries);
    expect(articleStates([], first.manifest, true)[0].state).toBe('missing');
    const next = createPlan(first.manifest, [a], [a], { hash: first.manifest.codeHash, commit: null });
    expect(next.manifest.entries[0].publishedAt).toBe(first.manifest.entries[0].publishedAt);
    const changed = { ...a, post: { ...a.post, slug: 'different' } };
    expect(() => createPlan(first.manifest, [changed], [changed], { hash: first.manifest.codeHash, commit: null })).toThrow('slug');
  });
  it('refuses links to unpublished targets and does not auto-select them', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A');
    const plan = createPlan(null, [a], [a], await codeBaseline(root, config));
    expect(() => validateArticleLinks(plan.manifest, [{ id: a.post.id, body: '[草稿](/article/b/)' }])).toThrow('未发布');
    expect(() => validateArticleLinks(plan.manifest, [{ id: a.post.id, body: `[草稿](blog:${randomUUID()})` }])).toThrow('未发布');
  });
  it('detects snapshot tampering and never replaces old snapshots with current source', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A'); await saveSnapshot(root, config, a);
    await writeFile(storePath(root, 'snapshots', a.revisionHash, 'files', 'assets', 'cover.png'), 'tampered');
    await expect(readSnapshot(root, a.revisionHash)).rejects.toThrow('快照资源被改动');
  });
  it('uses no-Git frozen code and rejects overlapping local publish operations', async () => {
    const { root, config } = await fixture(); const baseline = await codeBaseline(root, config, true);
    expect(await exists(path.join(root, '.git'))).toBe(false); expect(await exists(storePath(root, 'code', baseline.hash, 'src', 'build-fixture.mjs'))).toBe(true);
    const lock = path.join(root, '.blog', 'operation.lock');
    await withLock(lock, async () => { await expect(withLock(lock, async () => true)).rejects.toThrow('持有锁'); });
    expect(await exists(lock)).toBe(false);
  });
  it('detects a forged code descriptor even when its file checksums have been updated', async () => {
    const { root, config } = await fixture(); const source = await article(root, config, 'A');
    await saveSnapshot(root, config, source); const baseline = await codeBaseline(root, config, true);
    const descriptorFile = storePath(root, 'code', baseline.hash, 'code.json');
    const descriptor = await readJson(descriptorFile) as { hashes: [string, string][] };
    await writeFile(storePath(root, 'code', baseline.hash, 'src/build-fixture.mjs'), 'changed code');
    descriptor.hashes = descriptor.hashes.map(([file, hash]) => [file, file === 'src/build-fixture.mjs' ? sha256('changed code') : hash]);
    await writeJson(descriptorFile, descriptor);
    await expect(buildRelease(root, config, createPlan(null, [source], [source], baseline).manifest)).rejects.toMatchObject({ code: 4 });
  });
});

describe('deployment transactions and recovery', () => {
  it('rejects traversal and symlink tar entries before extraction without touching current', async () => {
    const { root, config, parent } = await fixture(); const a = await article(root, config, 'A'); const first = await publishFixture(root, config, [a]);
    for (const [name, type] of [['../escape.txt', '0'], ['unsafe-link', '2']]) {
      const id = `r-${randomUUID()}`; const archive = unsafeArchive(name, type);
      await writeFile(path.join(config.deploy!.root, 'staging', `${id}.tar`), archive);
      await expect(deployAction(root, config, 'receive', { releaseId: id, archiveHash: sha256(archive), checksumsHash: '0'.repeat(64) })).rejects.toMatchObject({ code: 3 });
      expect((await remoteCurrent(root, config))?.releaseId).toBe(first.manifest.releaseId);
      expect(await exists(path.join(config.deploy!.root, 'releases', id))).toBe(false);
    }
    expect(await exists(path.join(parent, 'escape.txt'))).toBe(false);
  });
  it('rejects stale concurrent plans; rollback restores the full version without changing local writing', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A'); const first = await publishFixture(root, config, [a]);
    const b = await article(root, config, 'B'); const second = await publishFixture(root, config, [b], first.manifest);
    await expect(deployAction(root, config, 'activate', { releaseId: first.manifest.releaseId, baseReleaseId: null })).rejects.toMatchObject({ code: 4 });
    const local = await readFile(path.join(root, b.sourcePath), 'utf8');
    await deployAction(root, config, 'rollback', { releaseId: first.manifest.releaseId, baseReleaseId: second.manifest.releaseId, operationId: `r-${randomUUID()}` });
    expect((await remoteCurrent(root, config))?.releaseId).toBe(first.manifest.releaseId);
    expect(await readFile(path.join(root, b.sourcePath), 'utf8')).toBe(local);
  });
  it('leaves old current intact on checksum failures and refuses unmanaged directories', async () => {
    const { root, config, parent } = await fixture(); const a = await article(root, config, 'A'); const first = await publishFixture(root, config, [a]);
    await writeFile(path.join(first.directory, 'site', 'index.html'), 'tampered');
    await expect(verifyPackage(first.directory)).rejects.toThrow('摘要错误');
    expect((await remoteCurrent(root, config))?.releaseId).toBe(first.manifest.releaseId);
    const unmanaged = path.join(parent, 'unmanaged'); await mkdir(unmanaged); await writeFile(path.join(unmanaged, 'index.html'), 'existing website');
    await expect(deployAction(root, { ...config, deploy: { type: 'local', root: unmanaged } }, 'prepare')).rejects.toThrow('not empty');
    expect(await readFile(path.join(unmanaged, 'index.html'), 'utf8')).toBe('existing website');
  });
  it('automatically rolls back a package whose public health check fails', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A'); const first = await publishFixture(root, config, [a]);
    const b = await article(root, config, 'B'); await saveSnapshot(root, config, b);
    const plan = createPlan(first.manifest, [b], [a, b], await codeBaseline(root, config, true));
    const second = await buildRelease(root, config, plan.manifest); await uploadRelease(root, config, second.manifest, second.directory);
    // A local test can use the same HTTP health code as SSH without contacting any remote host.
    const invalid = Buffer.from(JSON.stringify({ releaseId: second.manifest.releaseId, baseReleaseId: first.manifest.releaseId, siteUrl: 'http://127.0.0.1:1' })).toString('base64');
    const script = await readFile(new URL('./deploy-agent.py', import.meta.url), 'utf8');
    const result = JSON.parse((await run(['python3', '-', config.deploy!.root, 'activate', invalid], { cwd: root, input: script })).stdout);
    expect(result.status).toBe('FAILED_ROLLED_BACK');
    expect((await remoteCurrent(root, config))?.releaseId).toBe(first.manifest.releaseId);
  }, 15000);
  it('downloads and verifies private snapshots so deleting caches does not prevent recovery', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A'); const first = await publishFixture(root, config, [a]);
    const restored = await downloadRelease(root, config, first.manifest.releaseId, path.join(root, '.blog', 'restore-test'));
    await verifyPackage(restored);
    const original = await readFile(path.join(restored, 'snapshots', a.revisionHash, 'source.md'), 'utf8'); expect(original).toContain('A@v1');
  });
  it('quotes remote arguments without interpolating local shell content', () => { expect(shellQuote("a'b; $(touch bad)")).toBe("'a'\\''b; $(touch bad)'"); });
});

describe('real command entry and media processing', () => {
  it('creates articles from complete flags and keeps new dry-run read-only', async () => {
    const { root } = await fixture();
    const args = ['node', tsxFile, cliFile, 'new', '--root', root, '--category', 'learn', '--title', '参数新文章', '--slug', 'argument-post', '--json'];
    const planned = JSON.parse((await run([...args, '--dry-run'], { cwd: root })).stdout);
    expect(planned.status).toBe('PLANNED'); expect(planned.data.category).toBe('蘸豆！！');
    expect(await walk(path.join(root, 'content'))).toEqual([]);
    const created = JSON.parse((await run(args, { cwd: root })).stdout);
    expect(created.status).toBe('CREATED'); expect(created.data.file).toMatch(/^content\/蘸豆！！\/.+\/index.md$/);
    expect(splitDocument(await readFile(path.join(root, created.data.file), 'utf8')).data.title).toBe('参数新文章');
    expect(await exists(path.join(root, '.git'))).toBe(false);
  });
  it('does not start prompts or create directories for non-interactive missing or invalid inputs', async () => {
    const { root } = await fixture();
    for (const flags of [[], ['--json'], ['--title', '标题', '--yes'], ['--category', 'unknown', '--title', '标题', '--dry-run', '--json'], ['--category', 'life', '--title', ' ', '--dry-run', '--json']]) {
      await expect(run(['node', tsxFile, cliFile, 'new', '--root', root, ...flags], { cwd: root, timeout: 5000 })).rejects.toThrow(/INPUT_REQUIRED|栏目只能|标题不能为空/);
    }
    expect(await walk(path.join(root, 'content'))).toEqual([]); expect(await exists(storePath(root))).toBe(false);
  });
  it('checks unpublished article references during dry-run without creating snapshots', async () => {
    const { root, config } = await fixture(); config.deploy = null; await writeJson(path.join(root, 'blog.config.json'), config);
    const a = await article(root, config, 'A'); await writeFile(path.join(root, a.sourcePath), `${a.raw}\n\n[尚未发布](/article/not-published/)\n`);
    await expect(run(['node', tsxFile, cliFile, 'build', 'a', '--root', root, '--dry-run', '--json'], { cwd: root })).rejects.toThrow('未发布');
    expect(await exists(storePath(root))).toBe(false);
  });
  it('reports corrupt image bytes as a content error rather than a configuration error', async () => {
    const { root, config } = await fixture(); const source = await article(root, config, 'A');
    await writeFile(path.join(source.directory, 'assets/cover.png'), 'not an image');
    await expect(validateMedia(root, config, source.dependencies)).rejects.toMatchObject({ code: 3 });
    const changed = await readSourcePost(root, source.sourcePath, config); const snapshot = await saveSnapshot(root, config, changed);
    await expect(prepareMedia(root, config, snapshot, path.join(root, 'output'))).rejects.toMatchObject({ code: 3 });
  });
  it('dry-run writes no snapshots/commits and publish rejects an unconfigured deployment', async () => {
    const { root, config } = await fixture(); config.deploy = null; await writeJson(path.join(root, 'blog.config.json'), config);
    await article(root, config, 'A');
    const result = JSON.parse((await run(['node', tsxFile, cliFile, 'build', 'a', '--root', root, '--dry-run', '--json'], { cwd: root })).stdout);
    expect(result.status).toBe('PLANNED'); expect(result.data.git).toBe('skipped');
    expect(await exists(storePath(root))).toBe(false); expect(await exists(path.join(root, '.git'))).toBe(false);
    await expect(run(['node', tsxFile, cliFile, 'publish', 'a', '--root', root, '--yes', '--json'], { cwd: root })).rejects.toThrow('尚未配置部署');
    const synced = JSON.parse((await run(['node', tsxFile, cliFile, 'sync', '--root', root, '--json'], { cwd: root })).stdout);
    expect(synced.status).toBe('SKIPPED');
  });
  it('resumes a frozen plan after edits without adopting the new working revision', async () => {
    const { root, config } = await fixture(); await writeJson(path.join(root, 'blog.config.json'), config);
    const a = await article(root, config, 'A'); const baseline = await codeBaseline(root, config, true);
    const plan = createPlan(null, [a], [a], baseline); await saveSnapshot(root, config, a);
    await writeJson(storePath(root, 'plans', `${plan.manifest.releaseId}.json`), plan);
    await writeFile(path.join(root, a.sourcePath), a.raw.replace('A@v1', 'A@v2_NOT_SELECTED'));
    const result = JSON.parse((await run(['node', tsxFile, cliFile, 'publish', '--resume', plan.manifest.releaseId, '--root', root, '--yes', '--json'], { cwd: root })).stdout);
    expect(result.status).toBe('DEPLOYED');
    const html = await readFile(path.join(config.deploy!.root, 'current', 'article', 'a', 'index.html'), 'utf8');
    expect(html).toContain('A@v1'); expect(html).not.toContain('A@v2');
    expect(await readFile(path.join(root, a.sourcePath), 'utf8')).toContain('A@v2_NOT_SELECTED');
  });
  it('remembers the original slug and first publication time across withdrawal and republication', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A'); const baseline = await codeBaseline(root, config);
    const first = createPlan(null, [a], [a], baseline).manifest;
    const withdrawn = createPlan(first, [], [a], baseline, [a.post.id]).manifest;
    const republished = createPlan(withdrawn, [a], [a], baseline).manifest;
    expect(republished.entries[0].publishedAt).toBe(first.entries[0].publishedAt);
    expect(() => createPlan(withdrawn, [{ ...a, post: { ...a.post, slug: 'changed' } }], [a], baseline)).toThrow('slug');
  });
  it.skipIf(!hasVideoTools)('transcodes a real short video with audio and generates a poster without changing the source', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A');
    const video = path.join(a.directory, 'assets', 'demo.mp4');
    await run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=32x24:d=0.4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.4', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video], { cwd: root, code: 3 });
    const sourceBytes = await readFile(video);
    await writeFile(path.join(root, a.sourcePath), `${a.raw}\n\n![视频](./assets/demo.mp4)\n`);
    const source = await readSourcePost(root, a.sourcePath, config); const snapshot = await saveSnapshot(root, config, source);
    const output = path.join(root, 'output-media'); const mapping = await prepareMedia(root, config, snapshot, output);
    const generated = mapping['./assets/demo.mp4']; expect(generated.type).toBe('video'); expect(generated.poster).toMatch(/\.jpg$/);
    const probe = JSON.parse((await run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', path.join(output, generated.url.slice(1))], { cwd: root })).stdout);
    expect(probe.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio')).toBe(true);
    expect(await readFile(video)).toEqual(sourceBytes);
    await expect(prepareMedia(root, { ...config, media: { ...config.media, maxVideoSeconds: 0.1 } }, snapshot, path.join(root, 'rejected-media'))).rejects.toThrow('超过');
  }, 15000);
  it.skipIf(!hasVideoTools)('preserves all GIF frames instead of exporting a still image', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A'); const gif = path.join(a.directory, 'assets', 'animated.gif');
    await run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'testsrc=size=24x24:rate=3:duration=1', gif], { cwd: root });
    await writeFile(path.join(root, a.sourcePath), `${a.raw}\n\n![动图](./assets/animated.gif)\n`);
    const snapshot = await saveSnapshot(root, config, await readSourcePost(root, a.sourcePath, config));
    const output = path.join(root, 'output-media'); const mapping = await prepareMedia(root, config, snapshot, output);
    const generated = path.join(output, mapping['./assets/animated.gif'].url.slice(1));
    expect((await sharp(generated, { animated: true }).metadata()).pages).toBeGreaterThan(1);
    expect(sha256(await readFile(generated))).toBe(sha256(await readFile(gif)));
  }, 15000);
});

describe('Git is an optional real adapter, not a prerequisite', () => {
  it('skips Git with no configured repository', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A');
    expect((await syncContent(root, config, await backupPlan(root, config))).status).toBe('SKIPPED');
    expect((await saveReleaseToGit(root, config, createPlan(null, [a], [a], await codeBaseline(root, config)).manifest)).status).toBe('SKIPPED');
    expect(await exists(path.join(root, '.git'))).toBe(false);
  });
  it('backs up to a real temporary bare remote and restores without touching the root Git index', async () => {
    const { root, config, parent } = await fixture(); const a = await article(root, config, 'A');
    const remote = path.join(parent, 'remote.git'); await run(['git', 'init', '--bare', remote], { cwd: root });
    config.git = { remote, branch: 'content-source', visibility: 'private' };
    await run(['git', 'init', root], { cwd: root }); await writeFile(path.join(root, 'user-code.txt'), 'user staged data'); await run(['git', 'add', '--', 'user-code.txt'], { cwd: root });
    const stagedBefore = (await run(['git', 'diff', '--cached', '--binary'], { cwd: root })).stdout;
    const backup = await syncContent(root, config, await backupPlan(root, config)); expect(backup.status).toBe('SYNCED');
    expect((await run(['git', 'diff', '--cached', '--binary'], { cwd: root })).stdout).toBe(stagedBefore);
    const destination = path.join(parent, 'recovered'); await restoreGit(root, config, destination);
    expect(await readFile(path.join(destination, a.sourcePath), 'utf8')).toContain('A@v1');
    await saveSnapshot(root, config, a); const plan = createPlan(null, [a], [a], await codeBaseline(root, config));
    expect((await saveReleaseToGit(root, config, plan.manifest)).status).toBe('SYNCED'); expect(plan.manifest.entries[0].gitCommit).toMatch(/^[a-f0-9]{40}$/);
    expect((await run(['git', 'diff', '--cached', '--binary'], { cwd: root })).stdout).toBe(stagedBefore);
  });
  it('stores selected sources on publish without replacing other backed-up working revisions', async () => {
    const { root, config, parent } = await fixture(); const a = await article(root, config, 'A'); const b = await article(root, config, 'B');
    const remote = path.join(parent, 'remote.git'); await run(['git', 'init', '--bare', remote], { cwd: root });
    config.git = { remote, branch: 'content-source', visibility: 'private' };
    await saveSnapshot(root, config, a); await saveSnapshot(root, config, b);
    const baseline = await codeBaseline(root, config); const first = createPlan(null, [a], [a, b], baseline).manifest;
    await saveReleaseToGit(root, config, first, [a.post.id]);
    const firstRestore = path.join(parent, 'first-restore'); await restoreGit(root, config, firstRestore);
    expect(await readFile(path.join(firstRestore, a.sourcePath), 'utf8')).toContain('A@v1');
    expect(await exists(path.join(firstRestore, b.sourcePath))).toBe(false);
    await writeFile(path.join(root, a.sourcePath), a.raw.replace('A@v1', 'A@v2_BACKUP_ONLY'));
    await syncContent(root, config, await backupPlan(root, config));
    const second = createPlan(first, [b], [a, b], baseline).manifest;
    await saveReleaseToGit(root, config, second, [b.post.id]);
    const restored = path.join(parent, 'second-restore'); await restoreGit(root, config, restored);
    expect(await readFile(path.join(restored, a.sourcePath), 'utf8')).toContain('A@v2_BACKUP_ONLY');
    expect(await readFile(path.join(restored, b.sourcePath), 'utf8')).toContain('B@v1');
    expect(second.entries.find((entry) => entry.id === a.post.id)?.revisionHash).toBe(a.revisionHash);
  });
  it('refuses unconfirmed visibility and detects independent remote changes', async () => {
    const { root, config, parent } = await fixture(); await article(root, config, 'A'); const remote = path.join(parent, 'remote.git'); await run(['git', 'init', '--bare', remote], { cwd: root });
    config.git = { remote, branch: 'content-source', visibility: 'unconfirmed' };
    await expect(syncContent(root, config, await backupPlan(root, config))).rejects.toThrow('确认内容仓库');
    config.git.visibility = 'private'; await syncContent(root, config, await backupPlan(root, config));
    const other = path.join(parent, 'other'); await run(['git', 'clone', '-b', 'content-source', remote, other], { cwd: root });
    await writeFile(path.join(other, 'remote-change.txt'), 'other computer');
    await run(['git', 'add', '.'], { cwd: other }); await run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '-m', 'other'], { cwd: other }); await run(['git', 'push'], { cwd: other });
    await expect(syncContent(root, config, await backupPlan(root, config))).rejects.toMatchObject({ code: 4 });
  });
  it('detects source backup changes without implying online publication', async () => {
    const { root, config } = await fixture(); const a = await article(root, config, 'A'); const hash = sha256(await readFile(path.join(root, a.sourcePath)));
    await writeJson(storePath(root, 'backup.json'), { [a.sourcePath.slice(8)]: hash });
    expect((await backupPlan(root, config)).added).toContain(a.sourcePath.replace(/^content\//, '').replace('index.md', 'assets/cover.png'));
    await cacheCurrent(root, null); expect((await readJson(storePath(root, 'current.json')) as { manifest: unknown }).manifest).toBe(null);
  });
});
