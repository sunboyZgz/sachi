import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { defaultConfig, type BlogConfig } from '../../src/lib/blog/schema';
import { exists, sha256, stableJson, writeJson } from '../../src/lib/blog/files';
import { scanContent, readSourcePost, selectPosts } from '../../src/lib/blog/content';
import { contentDirectory, writingPath } from '../../src/lib/blog/storage';
import { newPost, editMeta } from '../blog-cli/writing';
import { newSeries } from '../blog-cli/series';
import { prepareSeriesInsertion, commitSeriesInsertion } from '../blog-cli/series-insertion';
import { prepareDraft, saveDraft, verifyDraft } from '../blog-cli/drafts';
import { prepareDraftRestore, commitDraftRestore, commitDraftUndo } from '../blog-cli/draft-restore';
import { prepareFormat, commitFormat } from '../blog-cli/format';
import { scanSeries } from '../../src/lib/blog/series';
import { backupPlan, syncContent } from '../blog-cli/git';
import { articleLocation } from '../vscode-preview/src/preview';
import { directoryHashes, migrateStorage, prepareMigration, undoMigration } from './migrate';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(legacy = true) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sachi-storage-'))); roots.push(root);
  const config: BlogConfig = { ...defaultConfig('Asia/Shanghai'), contentDir: legacy ? 'content' : '.blog-store/content' };
  await writeJson(path.join(root, 'blog.config.json'), config);
  const post = await newPost(root, config, { category: 'life', title: '值得备份的文章', now: new Date('2026-10-10T01:00:00Z') });
  return { root, config, post };
}
async function emptyBuilds(root: string) {
  await mkdir(path.join(root, '.blog-store/code/old'), { recursive: true });
  await writeFile(path.join(root, '.blog-store/code/old/code.json'), '{"frozen":true}');
  await mkdir(path.join(root, '.blog-store/releases/empty'), { recursive: true });
  await writeJson(path.join(root, '.blog-store/releases/empty/release.json'), { entries: [], baseReleaseId: null });
}
describe('unified storage and recoverable migration', () => {
  it('moves the live source only, preserving old draft records and semantic revision hashes', async () => {
    const { root, config, post } = await fixture();
    const archived = await saveDraft(root, await prepareDraft(root, post.id, '初稿'));
    const original = await readSourcePost(root, post.file, config);
    const protectedBytes = await directoryHashes(path.join(root, '.blog-store/drafts'));
    await emptyBuilds(root);
    const dry = await migrateStorage(root, { archiveEmptyBuilds: true, dryRun: true });
    expect(dry.status).toBe('PLANNED'); expect(await exists(path.join(root, '.blog-archive'))).toBe(false);
    const result = await migrateStorage(root, { archiveEmptyBuilds: true });
    expect(result.status).toBe('MIGRATED'); expect(await exists(path.join(root, 'content'))).toBe(false);
    expect(await directoryHashes(path.join(root, '.blog-store/drafts'))).toEqual(protectedBytes);
    const currentConfig = JSON.parse(await readFile(path.join(root, 'blog.config.json'), 'utf8'));
    const source = await readSourcePost(root, post.file, currentConfig);
    expect(source.revisionHash).toBe(original.revisionHash); expect(source.sourcePath).toBe(post.file);
    expect((await verifyDraft(root, archived.id)).record).toEqual(archived);
    expect(await migrateStorage(root, { archiveEmptyBuilds: true })).toEqual({ status: 'UNCHANGED' });
    const second = await newPost(root, currentConfig, { category: 'life', title: '迁移后的第二篇' });
    expect(second.file).toMatch(/^\.blog-store\/content\//);
    const scanned = await scanContent(root, currentConfig);
    expect(scanned.issues).toEqual([]); expect(selectPosts(scanned.posts, [second.file])[0].post.id).toBe(second.id);
    expect(articleLocation(root, path.join(root, second.file))?.detached).toBe(false);
    await editMeta(root, second.file, { title: '新目录可编辑' });
    expect((await readSourcePost(root, second.file, currentConfig)).post.title).toBe('新目录可编辑');
  });

  it('runs formatting, series insertion, full archives, restore and undo directly in the new layout', async () => {
    const { root, config, post } = await fixture(false);
    const file = path.join(root, post.file);
    await writeFile(file, (await readFile(file, 'utf8')).replace('在这里写正文。', '使用AI写字。'));
    const before = await readFile(file);
    const draft = await saveDraft(root, await prepareDraft(root, post.file));
    const formatted = await commitFormat(root, await prepareFormat(root, [post.file]));
    expect(formatted.insertedSpaces).toBe(2);
    const group = await newSeries(root, { category: 'life', title: '真实系列' });
    await commitSeriesInsertion(root, config, await prepareSeriesInsertion(root, config, post.id, group.id, 1));
    expect((await scanSeries(root)).series[0].series.id).toBe(group.id);
    const revised = await readFile(file);
    const restored = await commitDraftRestore(root, await prepareDraftRestore(root, draft.id));
    expect(await readFile(file)).toEqual(before);
    await commitDraftUndo(root, restored.transaction!);
    expect(await readFile(file)).toEqual(revised);
    expect(await exists(path.join(root, 'content'))).toBe(false);
    expect(Object.keys((await backupPlan(root, config)).hashes)).toContain(post.file.replace('.blog-store/content/', ''));
    expect(await syncContent(root, config, await backupPlan(root, config))).toMatchObject({ status: 'SKIPPED' });
  });

  it('resumes an interrupted rename before switching config and rejects additional edits', async () => {
    const { root, post } = await fixture(); await emptyBuilds(root);
    const config = await readFile(path.join(root, 'blog.config.json'), 'utf8');
    await expect(migrateStorage(root, { archiveEmptyBuilds: true, afterMove: async () => { throw Error('interrupted'); } })).rejects.toThrow('interrupted');
    expect(await readFile(path.join(root, 'blog.config.json'), 'utf8')).toBe(config);
    expect(await exists(path.join(root, '.blog-store', post.file))).toBe(true);
    await expect(newPost(root, defaultConfig(), { category: 'life', title: '迁移未完成不能写入' })).rejects.toThrow('迁移尚未完成');
    expect((await migrateStorage(root)).status).toBe('MIGRATED');
    const { root: other } = await fixture();
    await expect(migrateStorage(other, { afterMove: async () => { throw Error('interrupted'); } })).rejects.toThrow();
    await writeFile(path.join(other, '.blog-store/content/extra.md'), '额外编辑');
    await expect(migrateStorage(other)).rejects.toThrow('已有变化');
  });

  it('supports exact undo and refuses undo after new writing, locks, target collisions or live release references', async () => {
    const { root } = await fixture(); await emptyBuilds(root);
    const before = await directoryHashes(root);
    const result = await migrateStorage(root, { archiveEmptyBuilds: true });
    const id = 'journal' in result ? String(result.journal).split('/')[1] : '';
    await undoMigration(root, id);
    for (const [file, hash] of Object.entries(before)) expect(sha256(await readFile(path.join(root, file)))).toBe(hash);
    const { root: locked } = await fixture();
    await mkdir(path.join(locked, '.blog')); await writeFile(path.join(locked, '.blog/writing.lock'), '{}');
    await expect(migrateStorage(locked)).rejects.toThrow('锁');
    const { root: collision } = await fixture(); await mkdir(path.join(collision, '.blog-store/content'), { recursive: true });
    await expect(migrateStorage(collision)).rejects.toThrow('已存在');
    const { root: live } = await fixture(); await writeJson(path.join(live, '.blog-store/current.json'), { manifest: { entries: [] } });
    await expect(prepareMigration(live, true)).rejects.toThrow('当前发布');
    const { root: edited } = await fixture(); const moved = await migrateStorage(edited);
    await writeFile(path.join(edited, '.blog-store/content/new.md'), '新内容');
    await expect(undoMigration(edited, 'journal' in moved ? String(moved.journal).split('/')[1] : '')).rejects.toThrow('已有变化');
  });

  it('keeps fixture and live roots separate, and does not silently merge ambiguous legacy sources', async () => {
    const { root, config } = await fixture(false);
    await mkdir(path.join(root, 'tests/fixtures/content'), { recursive: true });
    await writeFile(path.join(root, 'tests/fixtures/content/demo.md'), '---\ntitle: 测试文章\ndate: 2026-10-10\ncategory: life\nfixture: true\n---\n正文');
    expect((await scanContent(root, config)).posts).toHaveLength(1);
    expect((await scanContent(root, config, 'tests/fixtures/content')).posts[0].post.fixture).toBe(true);
    const source = await writingPath(root, 'content/生活旁白/test.md');
    expect(source).toContain('.blog-store/content/');
    const { root: unconfigured } = await fixture(false); await rm(path.join(unconfigured, 'blog.config.json'));
    await mkdir(path.join(unconfigured, 'content'));
    await expect(contentDirectory(unconfigured)).rejects.toThrow('两处');
    expect(stableJson(config)).toContain('.blog-store/content');
  });
});
