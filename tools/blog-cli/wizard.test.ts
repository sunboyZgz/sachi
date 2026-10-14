import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scanContent, readSourcePost } from '../../src/lib/blog/content';
import { atomicWrite, BlogError, exists, readJson, writeJson } from '../../src/lib/blog/files';
import { defaultConfig, type BlogConfig } from '../../src/lib/blog/schema';
import { parseCli } from './arguments';
import { collectInitConfig, completeInvocation, mainChoices } from './wizard';
import { main } from './index';
import { newPost } from './writing';
import type { PromptDriver } from './prompts';
import { codeBaseline, saveSnapshot } from './snapshot';
import { createPlan } from './plan';
import { activateRelease, remoteCurrent, uploadRelease } from './deploy';
import { buildRelease } from './site';

const temporary: string[] = [];
async function fixture(withDeploy = false) {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sachi-wizard-test-'))); temporary.push(parent);
  const root = path.join(parent, 'project'); await mkdir(path.join(root, 'src'), { recursive: true });
  const config: BlogConfig = { ...defaultConfig('Asia/Shanghai'), siteAssets: [], buildCommand: ['node', 'src/build.mjs'], deploy: withDeploy ? { type: 'local', root: path.join(parent, 'server') } : null };
  await atomicWrite(path.join(root, 'src/build.mjs'), `import fs from 'node:fs/promises';
const posts=JSON.parse(await fs.readFile(process.env.BLOG_CONTENT_ROOT+'/posts.json','utf8'));
await fs.mkdir('out/contents',{recursive:true}); await fs.cp('public','out',{recursive:true});
await fs.writeFile('out/index.html','首页'); await fs.writeFile('out/contents/index.html',posts.map(p=>p.title).join(' | '));
for(const post of posts){const dir='out/article/'+post.slug;await fs.mkdir(dir,{recursive:true});await fs.writeFile(dir+'/index.html',post.title+post.body);}`);
  for (const [file, value] of Object.entries({ 'package.json': '{"type":"module"}', 'package-lock.json': '{}', 'next.config.ts': 'export default {};', 'tsconfig.json': '{}', 'next-env.d.ts': '' })) await atomicWrite(path.join(root, file), value);
  await mkdir(path.join(root, 'public')); await writeJson(path.join(root, 'blog.config.json'), config);
  const a = await newPost(root, config, { category: '生活旁白', title: '文章 A', slug: 'post-a' });
  const b = await newPost(root, config, { category: '蘸豆！！', title: '文章 B', slug: 'post-b' });
  const sample = await newPost(root, config, { category: '闲暇娱乐', title: '排版样例', slug: 'fixture' });
  const file = path.join(root, sample.file); await atomicWrite(file, (await readFile(file, 'utf8')).replace('title: 排版样例', 'title: 排版样例\nfixture: true'));
  return { root, config, parent, a, b };
}
function driver(select: string[] = [], checkbox: string[][] = [], input: string[] = [], confirm: boolean[] = []) {
  return {
    enabled: true,
    select: vi.fn<PromptDriver['select']>(async () => { const value = select.shift(); if (value === undefined) throw new Error('Unexpected select'); return value; }),
    checkbox: vi.fn<PromptDriver['checkbox']>(async () => { const value = checkbox.shift(); if (!value) throw new Error('Unexpected checkbox'); return value; }),
    input: vi.fn<PromptDriver['input']>(async (_message, validate, settings) => { const value = input.shift() ?? settings?.default; if (value === undefined) throw new Error('Unexpected input'); expect(await validate(value)).toBe(true); return value; }),
    confirm: vi.fn<PromptDriver['confirm']>(async () => confirm.shift() ?? false),
  };
}
function capture() {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => output.mock.calls.map(([message]) => String(message)).join('\n');
}
afterEach(async () => { vi.restoreAllMocks(); for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true }); });

describe('guided writing without parameter memorization', () => {
  it('puts the everyday writing workflow first and exposes every practical operation', () => {
    expect(mainChoices.slice(0, 4).map((choice) => choice.value)).toEqual(['new', 'dev', 'check', 'publish']);
    expect(mainChoices.map((choice) => choice.value)).toEqual(['new', 'dev', 'check', 'publish', 'push', 'meta', 'format', 'draft', 'search', 'series', 'toy', 'status', 'build', 'sync', 'unpublish', 'resume', 'history', 'rollback', 'restore', 'recover', 'init', 'doctor', 'quit']);
    expect(new Set(mainChoices.map((choice) => choice.value)).size).toBe(mainChoices.length);
  });
  it('enters the main menu, chooses the category and only asks for a title', async () => {
    const { root, config } = await fixture(); capture();
    const prompts = driver(['new', 'learn'], [], ['向导新文章']);
    await main(['--root', root], { prompts });
    const post = (await scanContent(root, config)).posts.find((source) => source.post.title === '向导新文章');
    expect(post?.post.category).toBe('learn'); expect(post?.sourcePath).toContain('蘸豆！！');
    expect(await exists(path.join(root, '.git'))).toBe(false);
  });
  it('exits the main menu without creating durable storage', async () => {
    const { root } = await fixture(); const output = capture();
    await main(['--root', root], { prompts: driver(['quit']) });
    expect(output()).toContain('未执行'); expect(await exists(path.join(root, '.blog-store'))).toBe(false);
  });
  it('does not leave a new article or empty directory after input cancellation', async () => {
    const { root, config } = await fixture(); capture(); const before = (await scanContent(root, config)).posts.length;
    const prompts = driver(['new', 'life']);
    prompts.input.mockRejectedValueOnce(new BlogError('已取消', 130, 'CANCELLED'));
    await expect(main(['--root', root], { prompts })).rejects.toMatchObject({ code: 130 });
    expect((await scanContent(root, config)).posts).toHaveLength(before); expect(await exists(path.join(root, '.blog'))).toBe(false);
  });
  it('selects metadata fields, previews the change, and leaves Markdown untouched on cancel', async () => {
    const { root, a } = await fixture(); const output = capture(); const before = await readFile(path.join(root, a.file), 'utf8');
    const prompts = driver(['meta', a.file, 'edit'], [['title', 'tags']], ['新标题', '日常，记录']);
    await expect(main(['--root', root], { prompts })).rejects.toMatchObject({ code: 130, status: 'CANCELLED' });
    expect(prompts.input.mock.calls[0][2]?.default).toBe('文章 A');
    expect(await readFile(path.join(root, a.file), 'utf8')).toBe(before); expect(output()).not.toContain('已修改');
  });
  it('updates chosen fields through the existing YAML-preserving writing service', async () => {
    const { root, config, a } = await fixture(); capture();
    const original = await readFile(path.join(root, a.file), 'utf8');
    await atomicWrite(path.join(root, a.file), original.replace('title: 文章 A', 'title: 文章 A # 保留注释'));
    await main(['meta', a.slug, '--root', root], { prompts: driver(['edit', 'true'], [['title', 'featured']], ['向导修改'], [true]) });
    const changed = await readSourcePost(root, a.file, config);
    expect(changed.post.title).toBe('向导修改'); expect(changed.post.featured).toBe(true);
    expect(changed.raw).toContain('# 保留注释'); expect(changed.raw).toContain('在这里写正文。');
  });
  it('selects the homepage or one article for preview without starting a server during dry-run', async () => {
    const { root, b } = await fixture(); const output = capture();
    await main(['dev', '--root', root, '--dry-run'], { prompts: driver([b.file]) });
    expect(output()).toContain('/article/post-b/'); expect(await exists(path.join(root, '.blog-store'))).toBe(false);
  });
  it('forces JSON and non-interactive scripts to use explicit inputs', async () => {
    const { root } = await fixture(); capture(); const prompts = driver(['new']);
    await expect(main(['new', '--root', root, '--json'], { prompts })).rejects.toMatchObject({ status: 'INPUT_REQUIRED' });
    await expect(main(['wizard', '--root', root, '--json'], { prompts })).rejects.toMatchObject({ status: 'INPUT_REQUIRED' });
    expect(prompts.select).not.toHaveBeenCalled(); expect(prompts.input).not.toHaveBeenCalled();
  });
});

describe('guided publication stays explicit and read-only until confirmed', () => {
  it('offers only formal articles, preserves multiple selection and defaults to plan-only', async () => {
    const { root, config, a, b } = await fixture(); const output = capture();
    const prompts = driver(['build', 'plan'], [[a.file, b.file]]);
    await main(['--root', root], { prompts });
    expect(prompts.checkbox.mock.calls[0][1].map((choice) => choice.value).sort()).toEqual([a.file, b.file].sort());
    expect(output()).toContain('本次选择 2 篇'); expect(output()).toContain('文章 A');
    expect(await exists(path.join(root, '.blog-store'))).toBe(false); expect(await exists(path.join(root, '.git'))).toBe(false);
    expect((await scanContent(root, config)).posts).toHaveLength(3);
  });
  it.each([[[]], [['not-an-article']]])('rejects an empty or forged selection instead of falling back to all drafts', async (selection) => {
    const { root, config } = await fixture();
    await expect(completeInvocation(root, config, parseCli(['build']), driver([], [selection]))).rejects.toMatchObject({ code: 2 });
    expect(await exists(path.join(root, '.blog-store'))).toBe(false);
  });
  it('does not freeze or build anything if the final confirmation is declined', async () => {
    const { root, a } = await fixture(); capture();
    await expect(main(['build', '--root', root], { prompts: driver(['execute'], [[a.file]], [], [false, false]) })).rejects.toMatchObject({ code: 130 });
    expect(await exists(path.join(root, '.blog-store'))).toBe(false); expect(await exists(path.join(root, 'out'))).toBe(false);
  });
  it('builds selected snapshots without publishing and without default-exporting out', async () => {
    const { root, a } = await fixture(); const output = capture();
    await main(['--root', root], { prompts: driver(['build', 'execute'], [[a.file]], [], [false, true]) });
    expect(output()).toContain('本地构建完成（未上线）'); expect(await exists(path.join(root, 'out'))).toBe(false);
    expect(await exists(path.join(root, '.blog-store/current.json'))).toBe(false);
  });
  it('refuses an unconfigured deployment before showing a publication selector', async () => {
    const { root, config } = await fixture(); const prompts = driver();
    await expect(completeInvocation(root, config, parseCli(['publish']), prompts)).rejects.toThrow('尚未配置部署');
    expect(prompts.checkbox).not.toHaveBeenCalled();
  });
  it('selects withdrawal targets from verified server data even when local originals are missing', async () => {
    const { root, config, a } = await fixture(true);
    const source = await readSourcePost(root, a.file, config);
    const plan = createPlan(null, [source], [source], await codeBaseline(root, config, true));
    await saveSnapshot(root, config, source);
    const built = await buildRelease(root, config, plan.manifest);
    await uploadRelease(root, config, built.manifest, built.directory); await activateRelease(root, config, built.manifest);
    await rm(path.join(root, path.dirname(a.file)), { recursive: true });
    const prompts = driver(['plan'], [[a.id]]);
    const invocation = await completeInvocation(root, config, parseCli(['unpublish']), prompts);
    expect(invocation).toMatchObject({ selectors: [a.id], options: { 'dry-run': true } });
    expect(prompts.checkbox.mock.calls[0][1][0].name).toContain('文章 A');
    expect((await remoteCurrent(root, config))?.releaseId).toBe(plan.manifest.releaseId);
  });
  it('offers unfinished frozen plans but not finished builds or deployments for resume', async () => {
    const { root, config } = await fixture();
    const pending = `r-${randomUUID()}`; const built = `r-${randomUUID()}`; const deployed = `r-${randomUUID()}`;
    for (const id of [pending, built, deployed]) await writeJson(path.join(root, '.blog-store/plans', `${id}.json`), { selected: [] });
    await writeJson(path.join(root, '.blog-store/receipts', `${built}.json`), { status: 'BUILD_ONLY' });
    await writeJson(path.join(root, '.blog-store/receipts', `${deployed}.json`), { status: 'DEPLOYED' });
    const prompts = driver(['resume', pending, 'plan']);
    const invocation = await completeInvocation(root, config, parseCli([]), prompts);
    expect(invocation).toMatchObject({ command: 'publish', selectors: [], options: { resume: pending, 'dry-run': true } });
    expect(prompts.select.mock.calls[1][1].map((choice) => choice.value)).toEqual([pending]);
    expect(await exists(path.join(root, '.blog-store/current.json'))).toBe(false);
  });
  it('selects a successful server release for rollback and leaves current unchanged in plan mode', async () => {
    const { root, config, a } = await fixture(true); const source = await readSourcePost(root, a.file, config);
    const plan = createPlan(null, [source], [source], await codeBaseline(root, config, true));
    await saveSnapshot(root, config, source); const built = await buildRelease(root, config, plan.manifest);
    await uploadRelease(root, config, built.manifest, built.directory); await activateRelease(root, config, built.manifest);
    const prompts = driver(['rollback', plan.manifest.releaseId, 'plan']);
    const invocation = await completeInvocation(root, config, parseCli([]), prompts);
    expect(invocation).toMatchObject({ command: 'rollback', options: { to: plan.manifest.releaseId, 'dry-run': true } });
    expect(prompts.select.mock.calls[1][1][0].value).toBe(plan.manifest.releaseId);
    expect((await remoteCurrent(root, config))?.releaseId).toBe(plan.manifest.releaseId);
  });
  it('requires a separate baseline acceptance in guided execution even with --yes', async () => {
    const { root, config, a, b } = await fixture(true); capture();
    const source = await readSourcePost(root, a.file, config);
    const plan = createPlan(null, [source], [source], await codeBaseline(root, config, true));
    await saveSnapshot(root, config, source); const built = await buildRelease(root, config, plan.manifest);
    await uploadRelease(root, config, built.manifest, built.directory); await activateRelease(root, config, built.manifest);
    await atomicWrite(path.join(root, 'src/new-code.ts'), 'export const changed = true;');
    const prompts = driver(['publish', 'execute'], [[b.file]], [], [false]);
    await expect(main(['--root', root, '--yes'], { prompts })).rejects.toMatchObject({ code: 130, status: 'CANCELLED' });
    expect(prompts.confirm.mock.calls[0][0]).toContain('全站代码/配置基线');
    expect((await remoteCurrent(root, config))?.releaseId).toBe(plan.manifest.releaseId);
  });
});

describe('guided initialization and recovery safety', () => {
  it('configures optional Git and SSH in memory without creating a repository or making connections', async () => {
    const { root, config } = await fixture();
    const prompts = driver(['configure', 'private', 'ssh', 'keep'], [], ['Asia/Shanghai', 'git@example.com:content.git', 'content-source', '/srv/sachi-blog', 'blog-prod', 'https://blog.example.com']);
    const draft = await collectInitConfig(root, config, prompts);
    expect(draft.git?.visibility).toBe('private'); expect(draft.deploy).toEqual({ type: 'ssh', root: '/srv/sachi-blog', host: 'blog-prod' });
    expect(await exists(path.join(root, '.git'))).toBe(false); expect(await readJson(path.join(root, 'blog.config.json'))).toEqual(config);
  });
  it('does not save configuration or templates after declining initialization', async () => {
    const { root, config } = await fixture(); capture();
    await expect(main(['init', '--root', root], { prompts: driver(['keep', 'keep', 'keep']) })).rejects.toMatchObject({ code: 130 });
    expect(await readJson(path.join(root, 'blog.config.json'))).toEqual(config); expect(await exists(path.join(root, 'templates'))).toBe(false);
  });
  it('saves initialization only after confirmation without enabling Git or deployment implicitly', async () => {
    const { root } = await fixture(); capture();
    await main(['init', '--root', root], { prompts: driver(['keep', 'keep', 'keep'], [], ['UTC'], [true]) });
    expect(await readJson(path.join(root, 'blog.config.json'))).toMatchObject({ timezone: 'UTC', git: null, deploy: null });
    expect(await exists(path.join(root, 'templates/post.md'))).toBe(true);
    expect(await exists(path.join(root, '.git'))).toBe(false);
  });
  it('can disable existing integrations explicitly while keeping configuration changes planned only', async () => {
    const { root, config } = await fixture(true);
    const draft = await collectInitConfig(root, { ...config, git: { remote: 'example', branch: 'content-source', visibility: 'private' } }, driver(['disable', 'disable', 'disable']));
    expect(draft.git).toBeNull(); expect(draft.deploy).toBeNull(); expect(await readJson(path.join(root, 'blog.config.json'))).toEqual(config);
  });
  it('asks for a fresh restore directory and checks unsafe or existing input before continuing', async () => {
    const { root, config, parent } = await fixture();
    const prompts = driver(['plan'], [], [path.join(parent, 'restore')]);
    prompts.input.mockImplementationOnce(async (_message, validate) => {
      expect(await validate(root)).not.toBe(true); expect(await validate(parent)).not.toBe(true);
      expect(await validate('')).not.toBe(true); expect(await validate(path.join(parent, 'restore'))).toBe(true);
      return path.join(parent, 'restore');
    });
    const invocation = await completeInvocation(root, { ...config, git: { remote: 'example', branch: 'content-source', visibility: 'private' } }, { ...parseCli(['restore']), guided: true }, prompts);
    expect(invocation).toMatchObject({ options: { destination: path.join(parent, 'restore'), 'dry-run': true } });
    expect(await exists(path.join(parent, 'restore'))).toBe(false);
  });
});
