import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { execa } from 'execa';
import { scanContent, selectPosts } from '../../../src/lib/blog/content';
import { BlogError, exists, withLock, writeJson } from '../../../src/lib/blog/files';
import { categoryNames, configSchema, categorySchema } from '../../../src/lib/blog/schema';
import { scanSeries, selectSeries } from '../../../src/lib/blog/series';
import { editSeries, newSeries, seriesAssignment } from '../series';
import { cachePath, validateConfig } from '../config';
import { deployAction, remoteCurrent } from '../deploy';
import { backupPlan } from '../git';
import { articleStates } from '../plan';
import { run } from '../process';
import { cacheCurrent } from '../snapshot';
import { editMeta, newPost, parseAssignments } from '../writing';
import { validateMedia } from '../media';
import { collectNewPostOptions } from '../prompts';
import { cachedManifest } from '../state';
import { pagesStatus, resolvePagesTarget } from '../pages';
import { releaseCurrent } from '../delivery';
import type { CommandContext } from '../context';
export async function executeWriting(context: CommandContext): Promise<boolean> {
  const { root, config, invocation, prompts, print, confirm } = context;
  const { command, selectors, options } = invocation;
  if (command === 'series') {
    const action = invocation.seriesAction ?? 'list';
    if (action === 'new') {
      const values = await collectNewPostOptions(options, prompts);
      const description = options.description ?? (prompts.enabled ? await prompts.input('系列简介（可留空）', () => true) : undefined);
      if (options['dry-run']) { print('PLANNED', { ...values, description }); return true; }
      await confirm(`创建系列 ${values.title}，不发布文章。`);
      print('CREATED', await withLock(cachePath(root, 'writing.lock'), () => newSeries(root, { ...values, description }))); return true;
    }
    const catalogue = await scanSeries(root);
    if (catalogue.issues.length) throw new BlogError(JSON.stringify(catalogue.issues));
    if (action === 'list') { print('READ', { series: catalogue.series.map((source) => ({ ...source.series, file: source.sourcePath })) }); return true; }
    let selector = selectors[0];
    if (!selector && prompts.enabled && catalogue.series.length) selector = await prompts.select('选择系列', catalogue.series.map((source) => ({ name: source.series.title, value: source.series.id, description: source.sourcePath })));
    if (!selector) throw new BlogError('series meta 需要系列 ID 或 slug。', 2, 'INPUT_REQUIRED');
    const source = selectSeries(catalogue.series, [selector])[0];
    const changes = parseAssignments(options.set ?? []);
    if (!options.set?.length && prompts.enabled && await prompts.select('系列资料操作', [{ name: '查看资料', value: 'read' }, { name: '修改名称与简介', value: 'edit' }]) === 'edit') {
      changes.title = await prompts.input('系列名称', (value) => value.trim() ? true : '名称不能为空。', { default: source.series.title });
      changes.description = await prompts.input('系列简介（留空清除）', () => true, { default: source.series.description });
    }
    if (!Object.keys(changes).length) { print('READ', source.series); return true; }
    if (options['dry-run']) { print('PLANNED', { file: source.sourcePath, changes }); return true; }
    await confirm(`修改系列 ${source.series.title}：\n${JSON.stringify(changes, null, 2)}\n发布该系列章节时会同步采用此资料。`);
    print('UPDATED', await withLock(cachePath(root, 'writing.lock'), () => editSeries(root, config, selector, changes))); return true;
  }
  if (command === 'init') {
    const values = { ...config, timezone: options.timezone ?? config.timezone,
      pages: options.pages || options['pages-remote'] ? { branch: 'blog', remote: options['pages-remote'] ?? config.pages?.remote ?? null } : config.pages,
      git: options['git-remote'] ? { remote: options['git-remote'], branch: 'content-source', visibility: options.visibility ?? 'unconfirmed' } : config.git };
    const initialized = validateConfig(root, invocation.configDraft ?? configSchema.parse(values));
    if (options['dry-run']) { print('PLANNED', initialized); return true; }
    await confirm(`将写入 blog.config.json：时区 ${initialized.timezone}；Git ${initialized.git ? '已配置' : '未启用'}；部署 ${initialized.deploy?.type ?? '未启用'}；Pages ${initialized.pages ? '启用，blog 分支' : '未启用'}。\n只创建缺失的模板和栏目目录，不建立根项目 Git 仓库，不连接服务器。`);
    await writeJson(path.join(root, 'blog.config.json'), initialized);
    for (const name of Object.values(categoryNames)) await mkdir(path.join(root, initialized.contentDir, name), { recursive: true });
    await mkdir(path.join(root, 'templates'), { recursive: true });
    const template = path.join(root, 'templates', 'post.md');
    if (!await exists(template)) {
      const { atomicWrite } = await import('../../../src/lib/blog/files');
      await atomicWrite(template, '## 开始\n\n在这里写正文。\n');
    }
    print('INITIALIZED', { timezone: initialized.timezone, git: initialized.git ? 'configured' : 'disabled', deploy: initialized.deploy ? 'configured' : 'disabled' }); return true;
  }
  if (command === 'doctor') {
    const checks: Record<string, unknown> = { node: process.version, gitIntegration: config.git ? 'configured' : 'disabled', deploy: config.deploy?.type ?? 'disabled', timezone: config.timezone };
    for (const [name, args] of [['git', ['--version']], ['python3', ['--version']], ['ffmpeg', ['-version']], ['ffprobe', ['-version']]] as const) {
      try { checks[name] = (await run([name, ...args], { cwd: root })).stdout.split('\n')[0]; } catch { checks[name] = 'unavailable (optional until corresponding feature is used)'; }
    }
    if (config.pages) checks.pages = await resolvePagesTarget(root, config).catch((error) => ({ reason: error.message }));
    if (options.remote && config.deploy) checks.server = await deployAction(root, config, 'current');
    if (options.remote && config.pages) checks.pages = await pagesStatus(root, config);
    print('CHECKED', checks); return true;
  }
  if (command === 'new') {
    const values = await collectNewPostOptions(options, prompts);
    const category = categorySchema.parse(Object.entries(categoryNames).find(([, name]) => name === values.category)?.[0]);
    let selector = options.series?.[0];
    let order = options.order;
    if (order !== undefined && !selector) throw new BlogError('--order 需要同时指定 --series。', 2);
    const catalogue = await scanSeries(root);
    const available = catalogue.series.filter((source) => source.series.category === category);
    if (!selector && prompts.enabled && available.length) {
      const chosen = await prompts.select('所属系列（可选）', [{ name: '普通文章，不加入系列', value: 'none' }, ...available.map((source) => ({ name: source.series.title, value: source.series.id }))]);
      if (chosen !== 'none') {
        selector = chosen;
        const suggested = await seriesAssignment(root, config, category, chosen);
        order = Number(await prompts.input('章节序号', (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? true : '请输入正整数。', { default: String(suggested.order) }));
      }
    }
    const assignment = selector ? await seriesAssignment(root, config, category, selector, order) : undefined;
    if (options['dry-run']) { print('PLANNED', { ...values, ...(assignment ? { series: assignment } : {}) }); return true; }
    print('CREATED', await withLock(cachePath(root, 'writing.lock'), async () => newPost(root, config, { ...values, series: selector ? await seriesAssignment(root, config, category, selector, order) : undefined }))); return true;
  }
  if (command === 'meta') {
    if (selectors.length !== 1) throw new BlogError('meta 需要一篇文章的路径、ID 或 slug。', 2);
    const scan = await scanContent(root, config);
    const found = scan.posts.find((source) => source.post.id === selectors[0] || source.post.slug === selectors[0] || source.sourcePath === selectors[0] || source.sourcePath.replace(/\/index.md$/, '') === selectors[0]);
    const selector = found?.sourcePath ?? selectors[0];
    const changes = parseAssignments(options.set ?? []);
    if (options.title) changes.title = options.title;
    if (options.slug) changes.slug = options.slug;
    if (!options.init && !Object.keys(changes).length) { print('READ', found?.post ?? { file: selector }); return true; }
    const cached = await cachedManifest(root);
    if (changes.slug && [...(cached.manifest?.entries ?? []), ...(cached.manifest?.retired ?? [])].some((entry) => entry.id === found?.post.id && entry.slug !== changes.slug)) throw new BlogError('曾发布文章不能更改 slug。', 3);
    if (options['dry-run']) { print('PLANNED', { file: selector, changes, initialize: !!options.init }); return true; }
    await confirm(`修改 ${selector} 的元信息，不修改其余字段：\n${JSON.stringify(changes, null, 2)}${options.init ? '\n补齐缺失的 ID 和创建时间。' : ''}`);
    print('UPDATED', await withLock(cachePath(root, 'writing.lock'), () => editMeta(root, selector, changes, options.init, config))); return true;
  }
  if (!['check', 'list', 'status', 'dev'].includes(command!)) return false;
  const scanned = await scanContent(root, config);
  if (command === 'check') {
    if (scanned.issues.length) throw new BlogError(`内容检查未通过：${JSON.stringify(scanned.issues)}`, 3, 'INVALID');
    const selected = selectors.length ? selectPosts(scanned.posts, selectors, { allowFixtures: true }) : scanned.posts;
    for (const source of selected) await validateMedia(root, config, source.dependencies, source.post.flow?.image);
    print('VALID', { posts: selected.map((source) => ({ id: source.post.id, file: source.sourcePath, dependencies: source.dependencies.map(({ url, bytes, hash }) => ({ url, bytes, hash })), warnings: source.warnings })) }); return true;
  }
  if (command === 'list' || command === 'status') {
    const pages = options.remote && config.pages ? await pagesStatus(root, config, { persist: !options['dry-run'] }) : null;
    const state = options.remote ? { manifest: config.deploy ? await remoteCurrent(root, config) : pages ? pages.manifest : await releaseCurrent(root, config), checkedAt: new Date().toISOString(), verified: !!config.deploy || pages?.status === 'DEPLOYED' } : await cachedManifest(root);
    if (state.verified && !options['dry-run']) await cacheCurrent(root, state.manifest);
    const backup = config.git ? await backupPlan(root, config) : null;
    print(state.verified ? 'VERIFIED' : 'CACHED', { checkedAt: state.checkedAt, git: config.git ? 'enabled' : 'disabled', backup, pages, releaseId: state.manifest?.releaseId ?? null, articles: articleStates(scanned.posts, state.manifest, state.verified), issues: scanned.issues }); return true;
  }
  if (command === 'dev') {
    if (scanned.issues.length) throw new BlogError(scanned.issues.map((issue) => `${issue.file}: ${issue.message}`).join('\n'));
    const selector = options.post ?? selectors[0];
    const post = selector ? scanned.posts.find((source) => source.post.id === selector || source.post.slug === selector || source.sourcePath === selector || source.sourcePath.replace(/\/index.md$/, '') === selector) : null;
    if (selector && !post) throw new BlogError(`找不到预览文章：${selector}`);
    print('PREVIEW', { url: post ? `http://127.0.0.1:4173/article/${post.post.slug}/` : 'http://127.0.0.1:4173/', command: config.devCommand });
    if (options['dry-run']) return true;
    await previewServer(config.devCommand, root, config.timezone);
    return true;
  }
  return false;
}

async function previewServer(command: string[], root: string, timezone: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, BLOG_CONTENT_MODE: 'working', BLOG_TIMEZONE: timezone };
  for (const key of ['BLOG_RELEASE_MANIFEST', 'BLOG_CONTENT_ROOT', 'BLOG_ASSET_PREFIX', 'NEXT_PUBLIC_BLOG_ASSET_PREFIX', 'NEXT_PUBLIC_BLOG_BASE_PATH']) delete env[key];
  const child = execa(command[0], command.slice(1), { cwd: root, env, extendEnv: false, shell: false, stdio: 'inherit' });
  const interrupt = () => { child.kill('SIGINT'); };
  process.once('SIGINT', interrupt);
  try { await child; }
  catch (error) {
    const result = error as { signal?: string; exitCode?: number; shortMessage?: string };
    if (result.signal !== 'SIGINT' && result.exitCode !== 130) throw new BlogError(`开发服务器退出：${result.shortMessage ?? String(error)}`, 2);
  } finally { process.removeListener('SIGINT', interrupt); }
}
