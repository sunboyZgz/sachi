import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { defaultConfig } from '../../src/lib/blog/schema';
import { readSourcePost, splitDocument } from '../../src/lib/blog/content';
import { exists, sha256, stableJson, walk } from '../../src/lib/blog/files';
import { editMeta, newPost } from './writing';
import { main } from './index';
import { collectNewPostOptions, type PromptDriver } from './prompts';
import { run } from './process';
import { saveSnapshot, readSnapshot } from './snapshot';

const temporary: string[] = [];
const config = defaultConfig('Asia/Shanghai');
async function fixture() { const root = await mkdtemp(path.join(os.tmpdir(), 'sachi-poetry-')); temporary.push(root); return root; }
function prompts(choices: string[]) {
  return { enabled: true, select: vi.fn<PromptDriver['select']>(async () => choices.shift()!), input: vi.fn<PromptDriver['input']>(async () => '教学诗歌'), checkbox: vi.fn<PromptDriver['checkbox']>(async () => ['type']), confirm: vi.fn<PromptDriver['confirm']>(async () => true) };
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('article types at every writing entry point', () => {
  it('supports poem and ordinary new articles while preserving the old default serialization', async () => {
    const root = await fixture();
    const ordinary = await newPost(root, config, { category: 'life', title: '普通文章' });
    const before = await readSourcePost(root, ordinary.file, config);
    expect(before.post).not.toHaveProperty('type'); expect(ordinary.type).toBe('article');
    expect(splitDocument(before.raw).data).not.toHaveProperty('type');
    const semantic = { post: before.post, media: before.media, dependencies: before.dependencies.map(({ url, file, hash, bytes }) => ({ url, file, hash, bytes })) };
    expect(before.revisionHash).toBe(sha256(stableJson(semantic)));
    const poem = await newPost(root, config, { category: 'life', title: '教学诗歌', type: 'poem' });
    const source = await readSourcePost(root, poem.file, config);
    expect(poem.type).toBe('poem'); expect(source.post.type).toBe('poem');
    expect(source.post.body).toContain('第一行诗。\n在这里写第二行诗。');
    expect(source.post.body).not.toContain('## 开始');
  });
  it('reads separate poetry templates and allows explicit types to override ordinary template defaults', async () => {
    const root = await fixture(); await mkdir(path.join(root, 'templates'));
    await writeFile(path.join(root, 'templates/poem.md'), '---\ntype: poem\ntags: [书信]\n---\n\n风带来一封信\n雨写下另一行\n');
    await writeFile(path.join(root, 'templates/post.md'), '---\ntype: poem\n---\n\n旧模板正文');
    const poem = await newPost(root, config, { category: 'play', title: '模板诗', type: 'poem' });
    expect((await readSourcePost(root, poem.file, config)).post).toMatchObject({ type: 'poem', tags: ['书信'], body: '风带来一封信\n雨写下另一行' });
    const ordinary = await newPost(root, config, { category: 'life', title: '覆盖模板', type: 'article' });
    expect((await readSourcePost(root, ordinary.file, config)).post.type).toBe('article');
    const inherited = await newPost(root, config, { category: 'life', title: '沿用模板' });
    expect((await readSourcePost(root, inherited.file, config)).post.type).toBe('poem');
  });
  it('offers poetry in the main new menu and metadata menu without prompting series for article types', async () => {
    const root = await fixture(); vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
    const guided = prompts(['new', 'life', 'poem']);
    await main(['--root', root], { prompts: guided });
    const file = (await walk(path.join(root, 'content'))).find((file) => file.endsWith('/index.md'))!;
    expect((await readSourcePost(root, `content/${file}`, config)).post.type).toBe('poem');
    const metadata = prompts(['meta', `content/${file}`, 'edit', 'article']);
    await main(['--root', root], { prompts: metadata });
    expect((await readSourcePost(root, `content/${file}`, config)).post.type).toBe('article');
    expect(metadata.select.mock.calls.find(([message]) => message === '文章类型')![1][0].value).toBe('poem');
    const series = prompts(['life']);
    expect(await collectNewPostOptions({}, series, { articleTypes: false })).not.toHaveProperty('type');
    expect(series.select).toHaveBeenCalledTimes(1);
  });
  it('can initialize handwritten poem metadata and change or remove a type without changing body bytes', async () => {
    const root = await fixture(), file = 'content/生活旁白/2026-10-14/index.md'; await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    const body = '\r\n第一行诗  \r\n第二行诗\r\n\r\n下一节\r\n';
    await writeFile(path.join(root, file), `\uFEFF---\r\ntitle: 教学诗 # 保留注释\r\ntype: poem\r\n---\r\n${body}`);
    await editMeta(root, file, {}, true, config);
    const initialized = await readSourcePost(root, file, config); expect(initialized.post.type).toBe('poem');
    await editMeta(root, file, { type: 'article' }, false, config);
    await editMeta(root, file, { type: null }, false, config);
    const after = await readFile(path.join(root, file), 'utf8');
    expect(splitDocument(after).bodyRaw).toBe(body); expect(after).toContain('# 保留注释'); expect(after.startsWith('\uFEFF')).toBe(true);
    expect((await readSourcePost(root, file, config)).post).not.toHaveProperty('type');
  });
  it('rejects invalid types and flow conflicts before writing or creating article directories', async () => {
    const root = await fixture(); await mkdir(path.join(root, 'templates'));
    await writeFile(path.join(root, 'templates/poem.md'), '---\nflow: { image: ./assets/a.png }\n---\n\n第一行\n第二行');
    await expect(newPost(root, config, { category: 'life', title: '冲突诗', type: 'poem' })).rejects.toThrow('诗歌模式暂不支持 flow');
    expect(await exists(path.join(root, 'content'))).toBe(false);
    const ordinary = await newPost(root, config, { category: 'life', title: '普通正文' });
    const before = await readFile(path.join(root, ordinary.file), 'utf8');
    await expect(editMeta(root, ordinary.file, { type: 'poetry' }, false, config)).rejects.toThrow();
    await expect(editMeta(root, ordinary.file, { type: 'poem', flow: { image: './assets/a.png' } }, false, config)).rejects.toThrow('诗歌模式暂不支持 flow');
    expect(await readFile(path.join(root, ordinary.file), 'utf8')).toBe(before);
    await editMeta(root, ordinary.file, { type: 'poem', flow: null }, false, config);
    expect((await readSourcePost(root, ordinary.file, config)).post.type).toBe('poem');
  });
  it('offers a type when initializing an untyped handwritten article, and preserves an existing type', async () => {
    const root = await fixture(), file = 'content/生活旁白/2026-10-14/index.md'; await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    const raw = '---\ntitle: 手写教学诗\n---\n\n风经过窗口\n留下第二行\n';
    await writeFile(path.join(root, file), raw); vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
    const guided = prompts(['poem']);
    await main(['meta', file, '--init', '--root', root, '--yes'], { prompts: guided });
    expect(guided.select).toHaveBeenCalledWith('文章类型', expect.any(Array));
    expect((await readSourcePost(root, file, config)).post.type).toBe('poem');
    expect(splitDocument(await readFile(path.join(root, file), 'utf8')).bodyRaw).toBe(splitDocument(raw).bodyRaw);
    const existing = prompts([]);
    await main(['meta', file, '--init', '--root', root, '--yes'], { prompts: existing });
    expect(existing.select).not.toHaveBeenCalled(); expect((await readSourcePost(root, file, config)).post.type).toBe('poem');
  });
  it('freezes explicit poem types and retains an old snapshot after a local type switch', async () => {
    const root = await fixture(); const created = await newPost(root, config, { category: 'life', title: '冻结诗', type: 'poem' });
    const poem = await readSourcePost(root, created.file, config); await saveSnapshot(root, config, poem);
    await editMeta(root, created.file, { type: 'article' }, false, config);
    const article = await readSourcePost(root, created.file, config);
    expect(article.revisionHash).not.toBe(poem.revisionHash);
    expect((await readSnapshot(root, poem.revisionHash)).post.type).toBe('poem');
  });
  it('runs real flags and JSON, keeps dry-run read-only and installs both templates without overwriting', async () => {
    const root = await fixture(); const cli = path.resolve('tools/blog-cli/index.ts'), tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
    const invoke = (args: string[]) => run(['node', tsx, cli, ...args, '--root', root, '--json'], { cwd: root });
    const planned = JSON.parse((await invoke(['new', '--category', 'life', '--title', '教学诗', '--type', 'poem', '--dry-run'])).stdout);
    expect(planned).toMatchObject({ status: 'PLANNED', data: { type: 'poem' } }); expect(await walk(root)).toEqual([]);
    const created = JSON.parse((await invoke(['new', '--category', 'life', '--title', '教学诗', '--type', 'poem'])).stdout).data;
    expect(created.type).toBe('poem'); const original = await readFile(path.join(root, created.file), 'utf8');
    expect(JSON.parse((await invoke(['meta', created.id, '--type', 'article', '--dry-run'])).stdout)).toMatchObject({ status: 'PLANNED', data: { changes: { type: 'article' } } });
    expect(await readFile(path.join(root, created.file), 'utf8')).toBe(original);
    await invoke(['meta', created.id, '--type', 'article', '--yes']);
    expect((await readSourcePost(root, created.file, config)).post.type).toBe('article');
    await invoke(['init', '--yes']); expect(await readFile(path.join(root, 'templates/poem.md'), 'utf8')).toContain('type: poem');
    await writeFile(path.join(root, 'templates/poem.md'), '自定义诗歌模板\n第二行'); await invoke(['init', '--yes']);
    expect(await readFile(path.join(root, 'templates/poem.md'), 'utf8')).toBe('自定义诗歌模板\n第二行');
    await expect(invoke(['new', '--category', 'life', '--title', '无效类型', '--type', 'poetry'])).rejects.toThrow('article, poem');
  }, 20_000);
});
