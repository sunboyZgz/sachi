import { afterEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { atomicWrite, exists, sha256, stableJson, walk } from '../../src/lib/blog/files';
import { scanContent } from '../../src/lib/blog/content';

import { legacyConfig as defaultConfig } from '../../tests/helpers/legacy-config';
import { compareDrafts, draftArchivePath, draftCatalogue, draftDestination, exportDraft, listDrafts, migrateDrafts, prepareDraft, prepareDraftMigration, readDraft, saveDraft, verifyDraft, type DraftRecord } from './drafts';
import { commitDraftRestore, commitDraftUndo, prepareDraftRestore } from './draft-restore';
import { assertNoPendingWrites, prepareBinaryWritingTransaction, recoverWritingTransactions } from './writing-transactions';
import { main } from './index';
import type { PromptDriver } from './prompts';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(body = '第一稿正文。') {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sachi-drafts-'))); roots.push(root);
  const id = randomUUID(); const file = 'content/闲暇娱乐/2026-10-10/index.md';
  const directory = path.join(root, path.dirname(file));
  await mkdir(path.join(directory, 'assets'), { recursive: true });
  const image = await sharp({ create: { width: 32, height: 24, channels: 4, background: '#596b50' } }).png().toBuffer();
  await writeFile(path.join(directory, 'assets/插画.png'), image);
  const prefix = `\uFEFF---\r\nid: ${id}\r\ntitle: 值得纪念的文章 # 留下注释\r\nslug: remembering\r\ncreatedAt: "2026-10-10T09:00:00+08:00"\r\n---\r\n\r\n`;
  const raw = prefix + body.replaceAll('\n', '\r\n');
  await writeFile(path.join(root, file), raw);
  await writeFile(path.join(directory, 'media.yaml'), '# 留下原预设注释\nassets: {}\n');
  await mkdir(path.join(root, '.blog-store/snapshots'), { recursive: true });
  await writeFile(path.join(root, '.blog-store/snapshots/public.json'), '{"body":"原公开版本"}');
  return { root, id, file, directory, prefix, raw, image };
}
async function tree(root: string) {
  return Object.fromEntries(await Promise.all((await walk(root)).map(async (file) => [file, sha256(await readFile(path.join(root, file)))])));
}
const prompts: PromptDriver = { enabled: false, select: async () => { throw new Error('unexpected question'); }, checkbox: async () => [], input: async () => '', confirm: async () => false };
function capture() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => JSON.parse(String(log.mock.calls.at(-1)![0]));
}
async function legacyArchive(f: Awaited<ReturnType<typeof fixture>>, note = '旧版初稿') {
  const plan = await prepareDraft(f.root, f.id, note, { forComparison: true });
  const { fingerprint: _fingerprint, ...fields } = plan;
  void _fingerprint;
  const contents = { ...fields, schemaVersion: 1 as const, id: randomUUID(), createdAt: new Date().toISOString() };
  const record: DraftRecord = { ...contents, digest: sha256(stableJson(contents)) };
  await mkdir(path.join(f.root, '.blog-store/drafts/objects'), { recursive: true });
  await mkdir(path.join(f.root, '.blog-store/drafts/records'), { recursive: true });
  for (const file of record.files) await writeFile(path.join(f.root, '.blog-store/drafts/objects', file.hash), await readFile(path.join(f.root, file.path)));
  await writeFile(path.join(f.root, `.blog-store/drafts/records/${record.id}.json`), JSON.stringify(record));
  return record;
}

describe('manually remembered article revisions', () => {
  it('freezes exact original Markdown, media bytes and preset comments without changing source or publication', async () => {
    const f = await fixture('::原稿。\\\n::还有想法。  ');
    const current = await scanContent(f.root, defaultConfig());
    const plan = await prepareDraft(f.root, 'remembering', '初稿');
    expect(plan.files).toHaveLength(3);
    const saved = await saveDraft(f.root, plan);
    expect(saved).toMatchObject({ articleId: f.id, note: '初稿', sequence: 1, parentId: null });
    expect((await readDraft(f.root, saved.id)).markdown).toBe(f.raw);
    const exported = await exportDraft(f.root, saved.id, 'draft-review');
    expect(await readFile(exported.sourceFile)).toEqual(Buffer.from(f.raw));
    expect(await readFile(path.join(exported.destination, path.dirname(f.file), 'assets/插画.png'))).toEqual(f.image);
    expect(await readFile(path.join(exported.destination, path.dirname(f.file), 'media.yaml'), 'utf8')).toContain('# 留下原预设注释');
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.raw);
    expect(await readFile(path.join(f.root, '.blog-store/snapshots/public.json'), 'utf8')).toBe('{"body":"原公开版本"}');
    expect((await scanContent(f.root, defaultConfig())).posts.map((source) => source.revisionHash)).toEqual(current.posts.map((source) => source.revisionHash));
  });

  it('records only requested stages, stores independent full copies and keeps repeated deliberate saves', async () => {
    const f = await fixture();
    const a = await saveDraft(f.root, await prepareDraft(f.root, f.id, '初稿'));
    const b = await saveDraft(f.root, await prepareDraft(f.root, f.id, '再读一遍，仍然想保留'));
    expect(b.id).not.toBe(a.id); expect(b.sequence).toBe(2); expect(b.parentId).toBe(a.id);
    expect(await exists(path.join(f.root, '.blog-store/drafts/objects'))).toBe(false);
    const first = path.join(f.root, draftArchivePath(a), f.file);
    const second = path.join(f.root, draftArchivePath(b), f.file);
    expect((await stat(first)).ino).not.toBe((await stat(second)).ino);
    expect(await readFile(first)).toEqual(await readFile(second));
    await writeFile(path.join(f.root, f.file), f.prefix + '尚未留存的第二稿。');
    expect((await listDrafts(f.root, f.id)).drafts).toHaveLength(2);
    const c = await saveDraft(f.root, await prepareDraft(f.root, f.id, '重写开头'));
    expect(c.sequence).toBe(3); expect(c.parentId).toBe(b.id);
    expect((await readDraft(f.root, a.id)).markdown).toBe(f.raw);
    expect((await readDraft(f.root, c.id)).markdown).toContain('尚未留存的第二稿。');
  });

  it('allows unfinished body and rendering parameters but refuses a version with missing resources', async () => {
    const f = await fixture('![还没找到](./assets/缺图.png)\n\n![还在构思][missing]\n\n```ts\n写到这里');
    await writeFile(path.join(f.root, f.file), f.raw.replace('slug: remembering', 'slug: remembering\r\nflow: { image: ./assets/缺图.png, width: 999 }'));
    await expect(prepareDraft(f.root, f.id, '还没完成')).rejects.toMatchObject({ status: 'DRAFT_INCOMPLETE' });
    expect(await exists(path.join(f.root, '.blog-store/drafts'))).toBe(false);
    await writeFile(path.join(f.root, f.file), (f.prefix + '```ts\n还在写').replace('slug: remembering', 'slug: remembering\r\nflow: { image: ./assets/插画.png, width: 999 }'));
    const saved = await saveDraft(f.root, await prepareDraft(f.root, f.id, '还没完成'));
    const source = (await readDraft(f.root, saved.id)).markdown;
    expect(source).toContain('width: 999'); expect(source).toContain('还在写');
  });

  it('captures changed assets as independent versions while retaining the original picture', async () => {
    const f = await fixture();
    const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    const next = await sharp({ create: { width: 48, height: 40, channels: 4, background: '#43533d' } }).png().toBuffer();
    await writeFile(path.join(f.directory, 'assets/插画.png'), next);
    const b = await saveDraft(f.root, await prepareDraft(f.root, f.id, '换了插画'));
    const difference = await compareDrafts(f.root, a.id, b.id);
    expect(difference.changed).toBe(true); expect(difference.files.map((entry) => entry.file)).toEqual([`${path.dirname(f.file)}/assets/插画.png`]);
    const old = await exportDraft(f.root, a.id, 'old-picture');
    expect(await readFile(path.join(old.destination, path.dirname(f.file), 'assets/插画.png'))).toEqual(f.image);
  });

  it('supports legacy identities and collects only referenced shared media', async () => {
    const f = await fixture();
    await mkdir(path.join(f.root, 'public/assets'), { recursive: true });
    await writeFile(path.join(f.root, 'public/assets/tea.png'), f.image);
    await writeFile(path.join(f.root, 'public/assets/site-only.txt'), '不属于这篇文章');
    await writeFile(path.join(f.root, 'content/legacy-note.md'), '---\ntitle: 旧笔记\ncategory: life\ndate: 2026-10-10\n---\n\n![茶](./assets/tea.png)');
    const saved = await saveDraft(f.root, await prepareDraft(f.root, 'legacy-note', '旧文章也值得保留'));
    expect(saved.articleId).toMatch(/^legacy-/);
    expect(saved.files.map((entry) => entry.path)).toEqual(['content/legacy-note.md', 'public/assets/tea.png']);
    expect((await listDrafts(f.root, saved.articleId)).drafts[0].id).toBe(saved.id);
  });

  it('continues the same article history after renaming its title or moving its date folder', async () => {
    const f = await fixture();
    const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    const next = path.join(f.root, 'content/闲暇娱乐/2026-10-11');
    await rename(f.directory, next);
    await writeFile(path.join(next, 'index.md'), f.raw.replace('值得纪念的文章', '后来想到的新标题'));
    const b = await saveDraft(f.root, await prepareDraft(f.root, f.id.toUpperCase()));
    expect(b.sequence).toBe(2); expect(b.parentId).toBe(a.id); expect(b.title).toBe('后来想到的新标题');
    expect((await listDrafts(f.root, f.id)).drafts).toHaveLength(2);
  });

  it('lists, shows, compares and exports old drafts after current files are deleted', async () => {
    const f = await fixture();
    const a = await saveDraft(f.root, await prepareDraft(f.root, f.id, '初稿'));
    await writeFile(path.join(f.root, f.file), f.prefix + '第二稿。');
    const b = await saveDraft(f.root, await prepareDraft(f.root, f.id, '第二稿'));
    await rm(f.directory, { recursive: true });
    expect((await listDrafts(f.root, 'remembering')).drafts.map((draft) => draft.id)).toEqual([a.id, b.id]);
    expect((await readDraft(f.root, a.id)).markdown).toBe(f.raw);
    expect((await compareDrafts(f.root, a.id, b.id)).patch).toContain('+第二稿。');
    expect(await exists((await exportDraft(f.root, a.id, 'recovered-memory')).sourceFile)).toBe(true);
  });

  it('shows Chinese insertions and removals, preserves final newline changes and compares against current working text', async () => {
    const f = await fixture('第一段。\n\n后来删掉的想法。');
    const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await writeFile(path.join(f.root, f.file), f.prefix + '第一段。\r\n\r\n新的体会。\r\n');
    const result = await compareDrafts(f.root, a.id);
    expect(result.to).toBe('working'); expect(result.patch).toContain('-后来删掉的想法。'); expect(result.patch).toContain('+新的体会。');
    expect(result.patch).toContain('No newline at end of file');
    expect((await compareDrafts(f.root, a.id, a.id)).changed).toBe(false);
    const other = 'content/other.md';
    await writeFile(path.join(f.root, other), '---\ntitle: 另一篇\ncategory: life\ndate: 2026-10-10\n---\n正文。');
    const b = await saveDraft(f.root, await prepareDraft(f.root, 'other'));
    await expect(compareDrafts(f.root, a.id, b.id)).rejects.toThrow('同一篇文章');
  });

  it('never overwrites an existing export target or exports into working/public/store directories', async () => {
    const f = await fixture();
    const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await mkdir(path.join(f.root, 'existing'));
    await writeFile(path.join(f.root, 'existing/keep.txt'), '保留');
    await expect(exportDraft(f.root, a.id, 'existing')).rejects.toThrow('已存在');
    for (const target of ['content/new-copy', 'public/old-draft', '.blog-store/old-draft', '.', '..', 'src/old-draft']) await expect(draftDestination(f.root, target)).rejects.toThrow();
    expect(await readFile(path.join(f.root, 'existing/keep.txt'), 'utf8')).toBe('保留');
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.raw);
  });

  it('refuses source, asset or file inventory changes after review without creating a record', async () => {
    const f = await fixture(); const plan = await prepareDraft(f.root, f.id);
    await writeFile(path.join(f.root, f.file), f.raw + '新编辑');
    await expect(saveDraft(f.root, plan)).rejects.toMatchObject({ status: 'SOURCE_CHANGED' });
    await writeFile(path.join(f.root, f.file), f.raw);
    await writeFile(path.join(f.directory, 'assets/new.txt'), '新素材');
    await expect(saveDraft(f.root, plan)).rejects.toMatchObject({ status: 'SOURCE_CHANGED' });
    await rm(path.join(f.directory, 'assets/new.txt'));
    await writeFile(path.join(f.directory, 'assets/插画.png'), '变更的内容');
    await expect(saveDraft(f.root, plan)).rejects.toMatchObject({ status: 'SOURCE_CHANGED' });
    expect((await draftCatalogue(f.root)).drafts).toHaveLength(0);
    expect(await exists(path.join(f.root, '.blog-store/drafts'))).toBe(false);
  });

  it('reports corrupted metadata and detects altered original/media objects before export', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    const recordFile = path.join(f.root, draftArchivePath(a), 'draft.json');
    const rawRecord = await readFile(recordFile, 'utf8');
    await writeFile(recordFile, rawRecord.replace('值得纪念的文章', '被改过的名字'));
    expect((await draftCatalogue(f.root)).issues).toHaveLength(1);
    await expect(prepareDraft(f.root, f.id)).rejects.toMatchObject({ status: 'DRAFT_INVALID' });
    await writeFile(recordFile, rawRecord);
    const media = a.files.find((entry) => entry.path.endsWith('.png'))!;
    await writeFile(path.join(f.root, draftArchivePath(a), media.path), '损坏');
    await expect(exportDraft(f.root, a.id, 'bad-export')).rejects.toMatchObject({ status: 'DRAFT_INVALID' });
    expect(await exists(path.join(f.root, 'bad-export'))).toBe(false);
    const source = a.files.find((entry) => entry.path === f.file)!;
    await writeFile(path.join(f.root, draftArchivePath(a), source.path), '损坏');
    await expect(readDraft(f.root, a.id)).rejects.toMatchObject({ status: 'DRAFT_INVALID' });
  });

  it('rejects symbolic links in source assets, history folders and archived objects', async () => {
    const f = await fixture();
    await symlink(path.join(f.root, f.file), path.join(f.directory, 'assets/linked.md'));
    await expect(prepareDraft(f.root, f.id)).rejects.toThrow('符号链接');
    await rm(path.join(f.directory, 'assets/linked.md'));
    const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    const entry = a.files.find((file) => file.path === f.file)!;
    const object = path.join(f.root, draftArchivePath(a), entry.path);
    await rm(object); await symlink(path.join(f.root, f.file), object);
    await expect(readDraft(f.root, a.id)).rejects.toThrow('符号链接');
    await expect(readDraft(f.root, '../outside')).rejects.toThrow();
  });

  it('ignores uncommitted record staging files and never exposes incomplete revisions', async () => {
    const f = await fixture();
    await mkdir(path.join(f.root, '.blog-store/drafts/records'), { recursive: true });
    await writeFile(path.join(f.root, `.blog-store/drafts/records/.pending-${randomUUID()}`), '{incomplete');
    expect(await draftCatalogue(f.root)).toEqual({ drafts: [], issues: [] });
    const saved = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    expect((await draftCatalogue(f.root)).drafts[0].id).toBe(saved.id);
  });

  it('rejects a tampered archive path even if someone recalculates its metadata checksum', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    const contents: Partial<typeof a> = { ...a };
    delete contents.digest;
    contents.files!.find((entry) => entry.path.endsWith('.png'))!.path = 'src/config/profile.json';
    const record = { ...contents, digest: sha256(stableJson(contents)) };
    await writeFile(path.join(f.root, draftArchivePath(a), 'draft.json'), JSON.stringify(record));
    await expect(exportDraft(f.root, a.id, 'outside-path')).rejects.toMatchObject({ status: 'DRAFT_INVALID' });
    expect(await exists(path.join(f.root, 'outside-path'))).toBe(false);
  });
});

describe('draft CLI confirmation and read-only queries', () => {
  it('keeps dry-run and cancelled saves free of new history and usable revision IDs', async () => {
    const f = await fixture(); const output = capture(); const before = await tree(f.root);
    await main(['draft', 'save', f.id, '--note', '初稿', '--root', f.root, '--dry-run', '--json'], { prompts });
    expect(output()).toMatchObject({ status: 'PLANNED', data: { sequence: 1, note: '初稿' } });
    expect(output().data.id).toBeUndefined(); expect(await tree(f.root)).toEqual(before);
    await expect(main(['draft', 'save', f.id, '--root', f.root], { prompts: { ...prompts, enabled: true } })).rejects.toMatchObject({ status: 'CANCELLED' });
    expect(await exists(path.join(f.root, '.blog-store/drafts'))).toBe(false);
    await expect(main(['draft', 'save', '--root', f.root, '--json'], { prompts })).rejects.toMatchObject({ status: 'INPUT_REQUIRED' });
  });

  it('runs list/show/diff and export previews without modifying records, source, snapshots or cache', async () => {
    const f = await fixture(); const output = capture();
    const saved = await saveDraft(f.root, await prepareDraft(f.root, f.id, '初稿'));
    const before = await tree(f.root);
    for (const args of [['list', f.id], ['show', saved.id], ['diff', saved.id], ['export', saved.id, '--destination', 'preview-export', '--dry-run']]) await main(['draft', ...args, '--root', f.root, '--json'], { prompts });
    expect(output().status).toBe('PLANNED'); expect(await tree(f.root)).toEqual(before);
    expect(await exists(path.join(f.root, 'preview-export'))).toBe(false);
  });

  it('supports the real installed CLI without Git, with notes, IDs and JSON queries', async () => {
    const f = await fixture(); const execute = promisify(execFile);
    const call = (args: string[]) => execute(process.execPath, [path.resolve('bin/blog.mjs'), 'draft', ...args, '--root', f.root, '--json'], { env: { ...process.env, PATH: '/no-git-or-media-tools' } });
    const saved = JSON.parse((await call(['save', 'remembering', '--note', '初稿', '--yes'])).stdout);
    expect(saved).toMatchObject({ command: 'draft', status: 'SAVED', data: { note: '初稿', articleId: f.id } });
    expect(JSON.parse((await call(['list', f.id])).stdout).data.drafts[0].id).toBe(saved.data.id);
    expect(JSON.parse((await call(['show', saved.data.id])).stdout).data.markdown).toBe(f.raw);
    expect(JSON.parse((await call(['diff', saved.data.id])).stdout).data.changed).toBe(false);
    await writeFile(path.join(f.root, f.file), f.raw + '稍后写的新稿');
    const restored = JSON.parse((await call(['restore', saved.data.id, '--yes'])).stdout);
    expect(restored).toMatchObject({ status: 'RESTORED', data: { articleId: f.id } });
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.raw);
    expect(JSON.parse((await call(['undo', restored.data.transaction, '--yes'])).stdout).status).toBe('UNDONE');
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toContain('稍后写的新稿');
    expect(await exists(path.join(f.root, '.git'))).toBe(false);
  }, 15_000);

  it('offers manual save from the menu and defaults to an unwritten plan', async () => {
    const f = await fixture();
    const choices = ['draft', 'save', f.id, 'plan'];
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const driver = { ...prompts, enabled: true, select: vi.fn(async () => choices.shift()!), input: vi.fn(async () => '重写了结尾') };
    await main(['--root', f.root], { prompts: driver });
    expect(log.mock.calls.join('\n')).toContain('重写了结尾');
    expect(log.mock.calls.join('\n')).toContain('执行后才生成稿件 ID');
    expect(await exists(path.join(f.root, '.blog-store/drafts'))).toBe(false);
  });
});

describe('standalone full archives and direct restoration', () => {
  it('stores all article files and a real video with its poster, then restores and undoes the entire version', async () => {
    const f = await fixture('![短片](./assets/clip.mp4)');
    const execute = promisify(execFile);
    const video = path.join(f.directory, 'assets/clip.mp4');
    await execute('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=32x24:d=0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
    await writeFile(path.join(f.directory, 'media.yaml'), 'assets:\n  ./assets/clip.mp4:\n    poster: ./assets/插画.png\n');
    await writeFile(path.join(f.directory, '想法.txt'), '当时的写作笔记');
    const a = await saveDraft(f.root, await prepareDraft(f.root, f.id, '初稿'));
    const initial = await tree(f.directory);
    const videoBytes = await readFile(video);
    await writeFile(path.join(f.root, f.file), f.prefix + '第二稿正文。');
    await writeFile(path.join(f.directory, 'assets/插画.png'), '后来换掉的图片');
    await writeFile(path.join(f.directory, 'assets/新增.txt'), '后来添的附件');
    await writeFile(path.join(f.directory, 'media.yaml'), 'assets: {}\n');
    await rm(video);
    const current = await tree(f.directory);
    const restored = await commitDraftRestore(f.root, await prepareDraftRestore(f.root, a.id));
    expect(await tree(f.directory)).toEqual(initial);
    expect(await readFile(video)).toEqual(videoBytes);
    expect(await readFile(path.join(f.root, '.blog-store/snapshots/public.json'), 'utf8')).toBe('{"body":"原公开版本"}');
    await commitDraftUndo(f.root, restored.transaction!);
    expect(await tree(f.directory)).toEqual(current);
  });

  it('makes each copied version portable without objects, other versions or the current article', async () => {
    const f = await fixture('![插画](./assets/插画.png)');
    const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await saveDraft(f.root, await prepareDraft(f.root, f.id));
    const target = await realpath(await mkdtemp(path.join(tmpdir(), 'sachi-single-archive-'))); roots.push(target);
    await mkdir(path.dirname(path.join(target, draftArchivePath(a))), { recursive: true });
    await cp(path.join(f.root, draftArchivePath(a)), path.join(target, draftArchivePath(a)), { recursive: true });
    expect((await verifyDraft(target, a.id)).markdown).toBe(f.raw);
    expect((await listDrafts(target, a.articleId)).drafts).toHaveLength(1);
    await commitDraftRestore(target, await prepareDraftRestore(target, a.id));
    expect(await readFile(path.join(target, '.blog-store', f.file), 'utf8')).toBe(f.raw);
    expect(await readFile(path.join(target, '.blog-store', path.dirname(f.file), 'assets/插画.png'))).toEqual(f.image);
  });

  it('restores a deleted article and can undo back to its absent state without leaving a phantom article folder', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await rm(f.directory, { recursive: true });
    const result = await commitDraftRestore(f.root, await prepareDraftRestore(f.root, a.id));
    expect(await exists(path.join(f.root, f.file))).toBe(true);
    await commitDraftUndo(f.root, result.transaction!);
    expect(await exists(f.directory)).toBe(false);
  });

  it('moves the same identity back to its archived folder and undoes the move with all resources', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    const moved = path.join(f.root, 'content/生活旁白/2026-10-12');
    await mkdir(path.dirname(moved), { recursive: true }); await rename(f.directory, moved);
    const result = await commitDraftRestore(f.root, await prepareDraftRestore(f.root, a.id));
    expect(await exists(moved)).toBe(false); expect(await exists(f.directory)).toBe(true);
    await commitDraftUndo(f.root, result.transaction!);
    expect(await exists(moved)).toBe(true); expect(await exists(f.directory)).toBe(false);
  });

  it('checks Markdown, cover, flow and preset poster closure, rejecting missing or remote media before any archive writes', async () => {
    const f = await fixture();
    const cases = [
      f.prefix + '![图片](https://example.com/image)',
      f.prefix + '![插画][picture]\n\n[picture]: ./assets/缺图.png',
      f.prefix.replace('slug: remembering', 'slug: remembering\r\ncover: ./assets/缺图.png') + '正文。',
      f.prefix.replace('slug: remembering', 'slug: remembering\r\nflow: { image: ./assets/插画.png, contour: ./assets/缺轮廓.json }') + '正文。',
      f.prefix + '[附件](./assets/缺少.csv)',
      f.prefix + '![越界](./assets/../index.md)',
    ];
    for (const source of cases) {
      await writeFile(path.join(f.root, f.file), source);
      await expect(prepareDraft(f.root, f.id)).rejects.toMatchObject({ status: 'DRAFT_INCOMPLETE' });
    }
    await writeFile(path.join(f.root, f.file), f.raw);
    await writeFile(path.join(f.directory, 'media.yaml'), 'assets:\n  ./assets/插画.png:\n    poster: ./assets/missing-poster.png\n');
    await expect(prepareDraft(f.root, f.id)).rejects.toMatchObject({ status: 'DRAFT_INCOMPLETE' });
    expect(await exists(path.join(f.root, '.blog-store/drafts'))).toBe(false);
  });

  it('refuses restore if a frozen media file was deleted or changed, without borrowing the current resource', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await rm(path.join(f.root, draftArchivePath(a), path.dirname(f.file), 'assets/插画.png'));
    const before = await tree(f.directory);
    await expect(prepareDraftRestore(f.root, a.id)).rejects.toMatchObject({ status: 'DRAFT_INVALID' });
    expect(await tree(f.directory)).toEqual(before);
    expect(await exists(path.join(f.root, '.blog-store/writing-transactions'))).toBe(false);
  });

  it('refuses edits made after review, including a newly added asset, and refuses undo after further editing', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await writeFile(path.join(f.root, f.file), f.raw + '第二稿');
    const plan = await prepareDraftRestore(f.root, a.id);
    await writeFile(path.join(f.directory, 'assets/new.txt'), '新资源');
    await expect(commitDraftRestore(f.root, plan)).rejects.toMatchObject({ status: 'SOURCE_CHANGED' });
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toContain('第二稿');
    const restored = await commitDraftRestore(f.root, await prepareDraftRestore(f.root, a.id));
    await writeFile(path.join(f.root, f.file), f.raw + '回档后继续写');
    await expect(commitDraftUndo(f.root, restored.transaction!)).rejects.toMatchObject({ status: 'SOURCE_CHANGED' });
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toContain('回档后继续写');
  });

  it('rolls back partial binary writes and deletions on failure, keeping the current Markdown and pictures exact', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await writeFile(path.join(f.root, f.file), f.raw + '当前新稿');
    await writeFile(path.join(f.directory, 'assets/新增.txt'), '当前新附件');
    await writeFile(path.join(f.directory, 'assets/插画.png'), '新版图片');
    const before = await tree(f.directory);
    let written = 0;
    await expect(commitDraftRestore(f.root, await prepareDraftRestore(f.root, a.id), async (file, bytes) => {
      if (++written === 2) throw new Error('模拟磁盘写入失败');
      await atomicWrite(file, bytes);
    })).rejects.toThrow('模拟磁盘写入失败');
    expect(await tree(f.directory)).toEqual(before);
    await expect(assertNoPendingWrites(f.root)).resolves.toBeUndefined();
  });

  it('recovers interrupted additions/deletions before a new restore while dry-run and queries remain read-only', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await writeFile(path.join(f.root, f.file), f.raw + '当前稿');
    await rm(path.join(f.directory, 'assets/插画.png'));
    const before = await tree(f.directory);
    const plan = await prepareDraftRestore(f.root, a.id);
    await prepareBinaryWritingTransaction(f.root, f.id, plan.changes);
    const created = plan.changes.find((entry) => !entry.before)!;
    await writeFile(path.join(f.root, created.file), created.after!);
    await expect(assertNoPendingWrites(f.root)).rejects.toMatchObject({ status: 'WRITING_RECOVERY_REQUIRED' });
    const pending = await tree(f.root);
    const output = capture();
    await main(['draft', 'list', f.id, '--root', f.root, '--json'], { prompts });
    expect(output().data.drafts).toHaveLength(1);
    await expect(main(['draft', 'restore', a.id, '--root', f.root, '--dry-run', '--json'], { prompts })).rejects.toMatchObject({ status: 'WRITING_RECOVERY_REQUIRED' });
    expect(await tree(f.root)).toEqual(pending);
    await recoverWritingTransactions(f.root);
    expect(await tree(f.directory)).toEqual(before);
    await main(['draft', 'restore', a.id, '--root', f.root, '--yes', '--json'], { prompts });
    expect(output().status).toBe('RESTORED');
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.raw);
  });

  it('keeps interrupted recovery records when extra edits conflict and blocks writing/builds without blocking history', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await writeFile(path.join(f.root, f.file), f.raw + '当前稿');
    const plan = await prepareDraftRestore(f.root, a.id);
    await prepareBinaryWritingTransaction(f.root, f.id, plan.changes);
    await writeFile(path.join(f.root, f.file), '不在前后版本中的额外编辑');
    await expect(recoverWritingTransactions(f.root)).rejects.toMatchObject({ status: 'WRITING_RECOVERY_CONFLICT' });
    await expect(prepareDraft(f.root, f.id)).rejects.toMatchObject({ status: 'WRITING_RECOVERY_REQUIRED' });
    await expect(main(['build', '--root', f.root, '--dry-run', '--json'], { prompts })).rejects.toMatchObject({ status: 'WRITING_RECOVERY_REQUIRED' });
    expect((await listDrafts(f.root)).drafts).toHaveLength(1);
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe('不在前后版本中的额外编辑');
  });

  it('does not replace another article occupying the original folder', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    const moved = path.join(f.root, 'content/闲暇娱乐/2026-10-12'); await rename(f.directory, moved);
    await mkdir(f.directory); await writeFile(path.join(f.root, f.file), f.raw.replace(f.id, randomUUID()));
    await expect(prepareDraftRestore(f.root, a.id)).rejects.toMatchObject({ status: 'DRAFT_RESTORE_CONFLICT' });
    expect(await exists(moved)).toBe(true);
  });

  it('migrates old complete object records preserving their IDs and bytes, but refuses incomplete old records', async () => {
    const f = await fixture('![插画](./assets/插画.png)');
    const old = await legacyArchive(f);
    const records = await prepareDraftMigration(f.root, f.id);
    await migrateDrafts(f.root, records);
    const migrated = (await verifyDraft(f.root, old.id)).record;
    expect(migrated).toMatchObject({ id: old.id, schemaVersion: 2, createdAt: old.createdAt, note: old.note, sequence: old.sequence });
    expect((await listDrafts(f.root)).drafts).toHaveLength(1);
    expect(await exists(path.join(f.root, `.blog-store/drafts/records/${old.id}.json`))).toBe(true);
    expect(await readFile(path.join(f.root, draftArchivePath(migrated), f.file), 'utf8')).toBe(f.raw);
    const missing = await fixture('![缺图](./assets/缺图.png)');
    const incomplete = await legacyArchive(missing);
    await expect(prepareDraftMigration(missing.root)).rejects.toMatchObject({ status: 'DRAFT_INCOMPLETE' });
    await expect(prepareDraftRestore(missing.root, incomplete.id)).rejects.toMatchObject({ status: 'DRAFT_INCOMPLETE' });
    expect((await readDraft(missing.root, incomplete.id)).markdown).toContain('缺图');
    expect(await exists(path.join(missing.root, draftArchivePath(incomplete)))).toBe(false);
  });

  it('requires confirmation for direct restore and keeps plans, cancellation and menus from changing current files', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await writeFile(path.join(f.root, f.file), f.raw + '现在的文字');
    const output = capture(); const before = await tree(f.root);
    await main(['draft', 'restore', a.id, '--root', f.root, '--dry-run', '--json'], { prompts });
    expect(output()).toMatchObject({ status: 'PLANNED', data: { changed: true } });
    expect(await tree(f.root)).toEqual(before);
    await expect(main(['draft', 'restore', a.id, '--root', f.root], { prompts: { ...prompts, enabled: true } })).rejects.toMatchObject({ status: 'CANCELLED' });
    expect(await tree(f.root)).toEqual(before);
    const choices = ['draft', 'restore', a.id, 'plan'];
    await main(['--root', f.root], { prompts: { ...prompts, enabled: true, select: async () => choices.shift()! } });
    expect(await tree(f.root)).toEqual(before);
  });

  it('recovers broken frontmatter while preserving the raw unfinished current text for undo', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    const broken = '---\ntitle: [还没填完\n\n正在修改元数据';
    await writeFile(path.join(f.root, f.file), broken);
    const restored = await commitDraftRestore(f.root, await prepareDraftRestore(f.root, a.id));
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.raw);
    await commitDraftUndo(f.root, restored.transaction!);
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(broken);
  });

  it('protects extra files added after restoration and preserves new files added during a failed restore', async () => {
    const f = await fixture(); const a = await saveDraft(f.root, await prepareDraft(f.root, f.id));
    await writeFile(path.join(f.root, f.file), f.raw + '新稿');
    const restored = await commitDraftRestore(f.root, await prepareDraftRestore(f.root, a.id));
    const extra = path.join(f.directory, 'assets/继续写作.txt');
    await writeFile(extra, '回档后新加的资料');
    await expect(commitDraftUndo(f.root, restored.transaction!)).rejects.toMatchObject({ status: 'SOURCE_CHANGED' });
    await rm(extra);
    await writeFile(path.join(f.root, f.file), f.raw + '新稿');
    const before = await readFile(path.join(f.root, f.file), 'utf8');
    await expect(commitDraftRestore(f.root, await prepareDraftRestore(f.root, a.id), async (file, bytes) => {
      await atomicWrite(file, bytes);
      await writeFile(extra, '写入期间新增的资料');
    })).rejects.toMatchObject({ status: 'SOURCE_CHANGED' });
    expect(await readFile(extra, 'utf8')).toBe('写入期间新增的资料');
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(before);
  });

  it('restores legacy resources without touching unrelated shared assets and refuses shared-resource conflicts', async () => {
    const f = await fixture();
    await mkdir(path.join(f.root, 'public/assets'), { recursive: true });
    await writeFile(path.join(f.root, 'public/assets/tea.png'), f.image);
    await writeFile(path.join(f.root, 'public/assets/unrelated.txt'), '共享目录其他附件');
    const source = '---\ntitle: 旧笔记\ncategory: life\ndate: 2026-10-10\n---\n![茶](/assets/tea.png)';
    await writeFile(path.join(f.root, 'content/legacy.md'), source);
    const a = await saveDraft(f.root, await prepareDraft(f.root, 'legacy'));
    await writeFile(path.join(f.root, 'public/assets/tea.png'), '新图片');
    await writeFile(path.join(f.root, 'public/assets/new.png'), f.image);
    await writeFile(path.join(f.root, 'content/legacy.md'), source + '\n新正文 ![新插画](/assets/new.png)');
    const result = await commitDraftRestore(f.root, await prepareDraftRestore(f.root, a.id));
    expect(await readFile(path.join(f.root, 'public/assets/tea.png'))).toEqual(f.image);
    expect(await readFile(path.join(f.root, 'public/assets/unrelated.txt'), 'utf8')).toBe('共享目录其他附件');
    expect(await readFile(path.join(f.root, 'public/assets/new.png'))).toEqual(f.image);
    await writeFile(path.join(f.root, 'content/other-legacy.md'), source.replace('旧笔记', '另一篇共享图片的文章'));
    await expect(commitDraftUndo(f.root, result.transaction!)).rejects.toMatchObject({ status: 'DRAFT_RESTORE_CONFLICT' });
    await rm(path.join(f.root, 'content/other-legacy.md'));
    await commitDraftUndo(f.root, result.transaction!);
    await writeFile(path.join(f.root, 'content/other-legacy.md'), source.replace('旧笔记', '另一篇共享图片的文章'));
    await expect(prepareDraftRestore(f.root, a.id)).rejects.toMatchObject({ status: 'DRAFT_RESTORE_CONFLICT' });
    expect(await readFile(path.join(f.root, 'public/assets/tea.png'), 'utf8')).toBe('新图片');
  });
});
