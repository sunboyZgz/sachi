import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { scanContent, type SourcePost } from '../../src/lib/blog/content';
import { BlogError, exists, readJson } from '../../src/lib/blog/files';
import { categoryNames, configSchema, releaseIdSchema, postSchema, seriesRefSchema, type BlogConfig } from '../../src/lib/blog/schema';
import { type CommandName, type Invocation } from './arguments';
import { validateConfig, storePath } from './config';
import { deployAction } from './deploy';
import { type Choice, type PromptDriver, validateTitle } from './prompts';
import { freshDestination } from './state';
import { releaseCurrent } from './delivery';
import { githubTarget } from './pages';
import { scanSeries } from '../../src/lib/blog/series';
import { seriesAssignment } from './series';
import { articleCatalogue } from './catalogue';
import { draftCatalogue, draftDestination } from './drafts';
import { draftRestoreHistory } from './writing-transactions';

const nonempty = (value: string): true | string => value.trim() ? true : '请输入非空内容。';
export const mainChoices: Choice[] = [
  { name: '新建文章 · new', value: 'new', description: '选择栏目，输入标题；自动生成写作目录' },
  { name: '预览首页或文章 · dev', value: 'dev', description: '先在本地检查阅读效果，不上线' },
  { name: '检查 Markdown 与资源 · check', value: 'check', description: '检查元数据、引用、图片与视频' },
  { name: '发布选中文章 · publish', value: 'publish', description: '默认不勾选任何文章；先看计划，再确认上线' },
  { name: '推送冻结版本 · push', value: 'push', description: '服务器部署 + blog 分支触发 Pages；main 保持不变' },
  { name: '查看或修改文章信息 · meta', value: 'meta' },
  { name: '整理正文中英文空格 · format', value: 'format', description: '明确选择文章，先看逐行差异；保留代码、公式和资源路径' },
  { name: '留存与回看稿件 · draft', value: 'draft', description: '主动全量保存正文与资源；查看修改过程、直接回档与撤销' },
  { name: '查找文章 ID · search', value: 'search', description: '输入中文标题或关键词，只列候选' },
  { name: '系列管理 · series', value: 'series', description: '维护系列名称、简介和所属栏目' },
  { name: '准备作品资料 · toy', value: 'toy', description: '逐项录入或填写 YAML；待媒体处理，不上传、不进入舞台' },
  { name: '查看文章状态 · status', value: 'status' },
  { name: '本地构建（不上线）· build', value: 'build' },
  { name: '保存全部写作备份（不上线）· sync', value: 'sync' },
  { name: '撤回公开文章 · unpublish', value: 'unpublish' },
  { name: '继续冻结发布计划 · publish --resume', value: 'resume' },
  { name: '查看发布历史 · history', value: 'history' },
  { name: '整站回滚 · rollback', value: 'rollback' },
  { name: '从 Git 恢复到新目录 · restore', value: 'restore' },
  { name: '从服务器恢复公开内容 · recover', value: 'recover' },
  { name: '配置项目与正式接入 · init', value: 'init' },
  { name: '检查运行环境 · doctor', value: 'doctor' },
  { name: '退出（不执行操作）', value: 'quit' },
];

function articleChoice(source: SourcePost): Choice {
  return { name: `${source.post.title} · ${categoryNames[source.post.category]}${source.post.fixture ? '（排版样例）' : ''}`, value: source.sourcePath,
    description: `${source.sourcePath} · ${source.post.id}` };
}
async function selectArticles(prompts: PromptDriver, posts: SourcePost[], multiple: boolean): Promise<string[]> {
  if (!posts.length) throw new BlogError('没有可选文章。请先新建正式文章；排版样例不能发布。', 2);
  const choices = posts.map(articleChoice);
  const selected = multiple ? await prompts.checkbox('明确选择本次文章（默认不勾选）', choices) : [await prompts.select('选择文章', choices)];
  if (!selected.length || new Set(selected).size !== selected.length || selected.some((value) => !choices.some((choice) => choice.value === value))) throw new BlogError('必须明确选择有效文章，不能默认采用全部草稿。', 2);
  return selected;
}

export async function collectInitConfig(root: string, current: BlogConfig, prompts: PromptDriver): Promise<BlogConfig> {
  const draft = structuredClone(current);
  draft.timezone = (await prompts.input('时区（回车保留当前值）', (value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return '请输入有效 IANA 时区，例如 Asia/Shanghai。'; }
  }, { default: current.timezone })).trim();
  const gitMode = await prompts.select('Git 写作备份（不是根项目仓库）', [
    { name: `保留当前设置（${current.git ? '已配置' : '未配置，不提交'}）`, value: 'keep' },
    { name: '配置或修改内容仓库', value: 'configure' }, { name: '停用 Git 备份', value: 'disable' },
  ]);
  if (gitMode === 'disable') draft.git = null;
  if (gitMode === 'configure') {
    const remote = (await prompts.input('内容仓库地址', (value) => !value.trim() || value.startsWith('-') ? '请输入有效仓库地址。' : true, { default: current.git?.remote })).trim();
    const branch = await prompts.input('内容分支', (value) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value) ? true : '分支只能使用字母、数字、下划线和短横线。', { default: current.git?.branch ?? 'content-source' });
    const visibility = await prompts.select('按仓库实际设置确认可见性（不会自动查询或创建仓库）', [
      { name: '暂不确认（禁止上传）', value: 'unconfirmed' }, { name: '私有仓库', value: 'private' }, { name: '公开仓库（全部写作备份可能公开）', value: 'public' },
    ]);
    draft.git = configSchema.shape.git.parse({ remote, branch, visibility });
  }
  const deployMode = await prompts.select('部署设置（仅保存配置，不连接服务器）', [
    { name: `保留当前设置（${current.deploy?.type ?? '未配置'}）`, value: 'keep' },
    { name: '配置 SSH 静态服务器', value: 'ssh' }, { name: '配置本地验收部署器', value: 'local' }, { name: '停用部署', value: 'disable' },
  ]);
  if (deployMode === 'disable') draft.deploy = null;
  if (deployMode === 'ssh' || deployMode === 'local') {
    const directory = await prompts.input('专用部署根目录（绝对路径，不使用已有网站目录）', (value) => path.isAbsolute(value) ? true : '必须填写专用绝对目录。', { default: current.deploy?.root });
    if (deployMode === 'ssh') {
      const host = await prompts.input('已配置的 SSH 主机别名', (value) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value) ? true : '请输入有效 SSH 别名。', { default: current.deploy?.type === 'ssh' ? current.deploy.host : undefined });
      draft.siteUrl = await prompts.input('正式站点地址（用于上线标记检查）', (value) => configSchema.shape.siteUrl.safeParse(value).success ? true : '请输入 HTTP(S) 站点地址。', { default: current.siteUrl ?? undefined });
      draft.deploy = { type: 'ssh', root: directory, host };
    } else draft.deploy = { type: 'local', root: directory };
  }
  const pagesMode = await prompts.select('GitHub Pages（main 开发 / blog 发布，同一仓库）', [
    { name: `保留当前设置（${current.pages ? '已启用' : '未启用'}）`, value: 'keep' },
    { name: '启用，默认使用根仓库 origin', value: 'auto' },
    { name: '启用，指定目标 GitHub 仓库', value: 'configure' },
    { name: '停用 Pages 推送', value: 'disable' },
  ]);
  if (pagesMode === 'disable') draft.pages = null;
  if (pagesMode === 'auto') draft.pages = { remote: null, branch: 'blog' };
  if (pagesMode === 'configure') draft.pages = { remote: (await prompts.input('目标 GitHub 仓库地址（不是网站 URL，不填写 token）', (value) => {
    try { githubTarget(value.trim()); return true; } catch (error) { return error instanceof Error ? error.message : '地址无效。'; }
  }, { default: current.pages?.remote ?? undefined })).trim(), branch: 'blog' };
  return validateConfig(root, configSchema.parse(draft));
}

async function collectMetadata(root: string, config: BlogConfig, invocation: Invocation, sources: SourcePost[], prompts: PromptDriver) {
  const mode = await prompts.select('文章信息操作', [
    { name: '查看信息（不修改）', value: 'read' }, { name: '按字段修改', value: 'edit' }, { name: '补齐手写文章的 ID 和创建时间', value: 'init' },
  ]);
  if (mode === 'read') return;
  if (mode === 'init') { invocation.options.init = true; return; }
  const fieldChoices = [
    { name: '标题', value: 'title' }, { name: '标签', value: 'tags' }, { name: '摘要', value: 'summary' },
    { name: '封面路径', value: 'cover' }, { name: '项目状态', value: 'status' },
    { name: '阅读分钟数', value: 'minutes' }, { name: '栏目精选', value: 'featured' },
    { name: '未发布文章的 URL slug', value: 'slug' },
    { name: '所属系列与章节顺序', value: 'series' },
  ];
  const fields = await prompts.checkbox('选择要修改的字段', fieldChoices);
  if (!fields.length || new Set(fields).size !== fields.length || fields.some((field) => !fieldChoices.some((choice) => choice.value === field))) throw new BlogError('必须明确选择有效修改字段。', 2);
  const selector = invocation.selectors[0];
  const post = sources.find((source) => [source.sourcePath, source.sourcePath.replace(/\/index.md$/, ''), source.post.id, source.post.slug].includes(selector))?.post;
  invocation.options.set = [];
  for (const field of fields) {
    let value: unknown;
    if (field === 'series') {
      if (!post) throw new BlogError('请先补齐并校验文章，再设置系列。');
      const available = (await scanSeries(root)).series.filter((source) => source.series.category === post.category);
      const choice = await prompts.select('所属系列', [...available.map((source) => ({ name: source.series.title, value: source.series.id })), { name: '退出系列／普通文章', value: 'none' }]);
      if (choice === 'none') value = null;
      else {
        const suggested = post.series?.id === choice ? post.series : await seriesAssignment(root, config, post.category, choice);
        const order = Number(await prompts.input('章节序号', (text) => Number.isSafeInteger(Number(text)) && Number(text) > 0 ? true : '请输入正整数。', { default: String(suggested.order) }));
        value = { id: choice, order };
      }
    } else if (field === 'featured') value = await prompts.select('是否作为栏目精选？', [{ name: '否', value: 'false' }, { name: '是', value: 'true' }]) === 'true';
    else if (field === 'tags') value = (await prompts.input('标签（逗号分隔，留空清除）', () => true, { default: post?.tags.join(', ') })).split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
    else {
      const validation = field === 'title' ? validateTitle : field === 'minutes' ? (text: string): true | string => !text || /^\d+$/.test(text) && Number(text) > 0 ? true : '请输入正整数，或留空恢复自动计算。' : field === 'slug' ? (text: string): true | string => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(text) ? true : '请输入有效 slug。' : () => true as const;
      const current = post?.[field as keyof typeof post];
      const answer = await prompts.input(`${{ title: '标题', summary: '摘要', cover: '封面路径', status: '项目状态', minutes: '阅读分钟数', slug: 'URL slug' }[field] ?? field}${['title', 'slug'].includes(field) ? '' : '（可选字段留空清除）'}`, validation, { default: typeof current === 'string' || typeof current === 'number' ? String(current) : undefined });
      value = answer.trim() ? field === 'minutes' ? Number(answer) : answer.trim() : null;
    }
    invocation.options.set.push(`${field}=${JSON.stringify(value)}`);
  }
}

async function releaseChoice(root: string, config: BlogConfig, prompts: PromptDriver, resume: boolean) {
  const choices: Choice[] = [];
  if (resume) {
    const plans = storePath(root, 'plans');
    for (const name of await exists(plans) ? await readdir(plans) : []) {
      if (!name.endsWith('.json') || !releaseIdSchema.safeParse(name.slice(0, -5)).success) continue;
      const id = name.slice(0, -5);
      const receiptFile = storePath(root, 'receipts', `${id}.json`);
      const receipt = await exists(receiptFile) ? await readJson(receiptFile) as { status?: string } : null;
      if (receipt?.status === 'BUILD_ONLY' || receipt?.status === 'DEPLOYED') continue;
      choices.push({ name: id, value: id, description: '使用冻结源快照与代码，不读取当前文章修订' });
    }
  } else {
    if (!config.deploy) throw new BlogError('尚未配置部署，不能查询回滚版本。请先进入配置向导。', 2);
    const history = await deployAction(root, config, 'history');
    for (const record of history.records ?? []) {
      const entry = record as { releaseId?: string; status?: string; activatedAt?: string };
      if (entry.status !== 'DEPLOYED' || !releaseIdSchema.safeParse(entry.releaseId).success || choices.some((choice) => choice.value === entry.releaseId)) continue;
      choices.push({ name: `${entry.activatedAt ?? ''} · ${entry.releaseId}`, value: entry.releaseId! });
    }
  }
  if (!choices.length) throw new BlogError(resume ? '没有可恢复的冻结发布计划。' : '没有成功发布的回滚版本。', 2);
  const selected = await prompts.select(resume ? '选择冻结发布计划' : '选择整站回滚版本', choices.toReversed());
  if (!choices.some((choice) => choice.value === selected)) throw new BlogError('必须选择有效发布版本。', 2);
  return selected;
}

export async function completeInvocation(root: string, config: BlogConfig, original: Invocation, prompts: PromptDriver): Promise<Invocation | null> {
  const invocation: Invocation = { ...original, selectors: [...original.selectors], options: { ...original.options } };
  if (!invocation.command || invocation.command === 'wizard') {
    if (!prompts.enabled) throw new BlogError('分步向导需要交互终端；脚本或 --json 模式请提供具体命令和参数。', 2, 'INPUT_REQUIRED');
    const selected = await prompts.select('今天想做什么？', mainChoices);
    if (selected === 'quit') return null;
    if (!mainChoices.some((choice) => choice.value === selected)) throw new BlogError('未知向导操作。', 2);
    invocation.command = selected === 'resume' ? 'publish' : selected as CommandName;
    invocation.guided = true;
    if (selected === 'resume') invocation.options.resume = await releaseChoice(root, config, prompts, true);
  }
  if (!prompts.enabled) return invocation;
  const { command, options } = invocation;
  if (command === 'draft') {
    if (!invocation.draftAction) {
      const selected = await prompts.select('稿件历史', [{ name: '主动全量留存当前稿', value: 'save' }, { name: '查看稿件历史', value: 'list' }, { name: '直接回档正文与资源', value: 'restore' }, { name: '撤销一次回档', value: 'undo' }, { name: '阅读一份原稿', value: 'show' }, { name: '对比稿件差异', value: 'diff' }, { name: '取回旧稿到新目录', value: 'export' }, { name: '转换旧对象格式稿件', value: 'migrate' }]);
      if (!['save', 'list', 'show', 'diff', 'export', 'restore', 'undo', 'migrate'].includes(selected)) throw new BlogError('未知稿件操作。', 2);
      invocation.draftAction = selected as Invocation['draftAction'];
    }
    const action = invocation.draftAction;
    if (action === 'save') {
      if (!invocation.selectors.length) {
        const catalogue = await articleCatalogue(root);
        if (!catalogue.articles.length) throw new BlogError('没有可留存的正式文章，请先新建或补齐文章身份。', 2, 'INPUT_REQUIRED', catalogue.issues);
        const choices = catalogue.articles.map((article) => ({ name: `${article.title} · ${categoryNames[article.category]}`, value: article.id, description: article.file }));
        const id = await prompts.select('选择要留存的文章', choices);
        if (!choices.some((choice) => choice.value === id)) throw new BlogError('请选择有效文章。', 2);
        invocation.selectors = [id]; invocation.guided = true;
      }
      if (options.note === undefined && !options.yes) options.note = await prompts.input('稿件备注（可留空，例如初稿、重写了结尾）', (value) => value.length <= 1000 && !value.includes('\0') ? true : '备注最多 1000 字符，不允许空字符。');
    } else if (action === 'undo') {
      if (!invocation.selectors.length) {
        const history = await draftRestoreHistory(root);
        if (!history.length) throw new BlogError('尚无已完成回档记录。', 2, 'INPUT_REQUIRED');
        const choices = history.map((entry) => ({ name: `${entry.articleId} · ${entry.createdAt}`, value: entry.id }));
        const id = await prompts.select('选择要撤销的回档', choices);
        if (!choices.some((choice) => choice.value === id)) throw new BlogError('请选择有效回档记录。', 2);
        invocation.selectors = [id]; invocation.guided = true;
      }
    } else if (action !== 'list' && action !== 'migrate') {
      const catalogue = await draftCatalogue(root);
      if (!invocation.selectors.length) {
        if (!catalogue.drafts.length) throw new BlogError('尚无留存稿件，请先 draft save。', 2, 'INPUT_REQUIRED', catalogue.issues);
        const choices = catalogue.drafts.toReversed().map((record) => ({ name: `${record.title} · 第 ${record.sequence} 稿${record.note ? ` · ${record.note}` : ''}`, value: record.id, description: `${record.createdAt} · ${record.id}` }));
        const id = await prompts.select(action === 'diff' ? '选择要对比的旧稿' : '选择稿件', choices);
        if (!choices.some((choice) => choice.value === id)) throw new BlogError('请选择有效稿件。', 2);
        invocation.selectors = [id]; invocation.guided = true;
      }
      if (action === 'diff' && invocation.guided && !invocation.selectors[1]) {
        const previous = catalogue.drafts.find((record) => record.id === invocation.selectors[0]);
        const choices = [{ name: '当前已保存的文章', value: 'working' }, ...catalogue.drafts.filter((record) => record.articleId === previous?.articleId && record.id !== previous?.id).map((record) => ({ name: `第 ${record.sequence} 稿 · ${record.note || record.createdAt}`, value: record.id }))];
        const id = await prompts.select('对比哪一稿？', choices);
        if (!choices.some((choice) => choice.value === id)) throw new BlogError('请选择有效对比目标。', 2);
        if (id !== 'working') invocation.selectors.push(id);
      }
      if (action === 'export' && !options.destination) options.destination = await prompts.input('取回到尚不存在的独立目录（保留当前稿）', async (value) => {
        try { await draftDestination(root, value); return true; } catch (error) { return (error as Error).message; }
      });
    }
  }
  if (command === 'format' && !invocation.selectors.length) {
    const { articles, issues } = await articleCatalogue(root);
    if (!articles.length) throw new BlogError('没有可格式化的正式文章，请先新建或补齐文章身份。', 2, 'INPUT_REQUIRED', issues);
    const choices = articles.map((article) => ({ name: `${article.title} · ${categoryNames[article.category]}`, value: article.file, description: `${article.file} · ${article.id}` }));
    const selected = await prompts.checkbox('明确选择要整理空格的文章（默认不勾选）', choices);
    if (!selected.length || new Set(selected).size !== selected.length || selected.some((file) => !choices.some((choice) => choice.value === file))) throw new BlogError('必须明确选择有效文章，不会默认格式化全部文章。', 2);
    invocation.selectors = selected;
    invocation.guided = true;
  }
  if (command === 'toy' && !invocation.toyAction) {
    const selected = await prompts.select('作品资料管理（当前仅本地准备）', [{ name: '逐项录入作品', value: 'add' }, { name: '从填写文件录入作品', value: 'file' }, { name: '生成填写模板', value: 'template' }, { name: '查看作品 ID 与状态', value: 'list' }, { name: '重新检查作品', value: 'check' }]);
    if (!['add', 'file', 'template', 'list', 'check'].includes(selected)) throw new BlogError('未知作品资料操作。', 2);
    if (selected === 'file') options.file = await prompts.input('已填写的作品 YAML 路径', nonempty);
    invocation.toyAction = selected === 'file' ? 'add' : selected as Invocation['toyAction'];
  }
  if (command === 'init' && (invocation.guided || !options.yes && !options.timezone && !options['git-remote'] && !options.pages && !options['pages-remote'])) invocation.configDraft = await collectInitConfig(root, config, prompts);
  if (['status', 'list', 'history', 'doctor'].includes(command!) && invocation.guided && (config.deploy || config.pages) && !options.remote) options.remote = await prompts.select('状态数据来源', [{ name: '本地缓存（不代表已核实线上）', value: 'cached' }, { name: '只读查询服务器 / Pages', value: 'remote' }]) === 'remote';
  if (command === 'push' && !invocation.selectors.length) {
    const releases = storePath(root, 'releases');
    const choices: Choice[] = [];
    for (const id of await exists(releases) ? await readdir(releases) : []) {
      if (!releaseIdSchema.safeParse(id).success || !await exists(path.join(releases, id, 'checksums.json'))) continue;
      const release = await readJson(path.join(releases, id, 'release.json')) as { createdAt: string; entries: { title: string }[] };
      choices.push({ name: `${release.createdAt} · ${id}`, value: id, description: release.entries.map((entry) => entry.title).join('、') || '空站 / 撤回版本' });
    }
    if (!choices.length) throw new BlogError('还没有冻结发布包；先 build 或 publish 明确选中文章。', 2);
    const id = await prompts.select('选择冻结发布包（不读取当前草稿）', choices.toReversed());
    if (!choices.some((choice) => choice.value === id)) throw new BlogError('请选择有效发布包。', 2);
    invocation.selectors = [id]; invocation.guided = true;
    if (!options['pages-remote'] && await prompts.select('Pages 仓库来源', [{ name: '使用配置，未指定时读取根仓库 origin', value: 'auto' }, { name: '仅本次指定 GitHub 仓库', value: 'override' }]) === 'override') options['pages-remote'] = (await prompts.input('本次目标仓库地址', (value) => {
      try { githubTarget(value.trim()); return true; } catch { return '请输入 github.com 的 HTTPS 或 SSH 仓库地址。'; }
    })).trim();
    if (!options['setup-pages']) options['setup-pages'] = await prompts.confirm('如目标未启用 Pages，是否显式启用 GitHub Actions 发布源？（不更改仓库可见性或自定义域名）');
  }
  if (['restore', 'recover'].includes(command!) && !options.destination) {
    if (command === 'restore' && !config.git) throw new BlogError('没有配置 Git 内容仓库；可以进入配置向导，或从已配置服务器恢复公开内容。', 2);
    if (command === 'recover' && !config.deploy) throw new BlogError('尚未配置部署，不能恢复服务器内容。', 2);
    options.destination = await prompts.input('恢复到尚不存在的新目录（不会覆盖当前写作）', async (value) => {
      try { const destination = freshDestination(root, value.trim()); return await exists(destination) ? '目标已存在，请输入新目录。' : true; }
      catch (error) { return error instanceof Error ? error.message : '路径无效。'; }
    });
  }
  if (command === 'rollback' && !options.to) options.to = await releaseChoice(root, config, prompts, false);
  if (command === 'unpublish' && !invocation.selectors.length) {
    if (!config.deploy && !config.pages) throw new BlogError('尚未配置部署，不能选择公开文章撤回。', 2);
    const current = await releaseCurrent(root, config);
    const entries = current?.entries ?? [];
    if (!entries.length) throw new BlogError('当前没有公开文章可撤回。', 2);
    invocation.selectors = await prompts.checkbox('选择明确撤回的公开文章（保留本地原文）', entries.map((entry) => ({ name: `${entry.title} · ${entry.slug}`, value: entry.id })));
    if (!invocation.selectors.length || new Set(invocation.selectors).size !== invocation.selectors.length || invocation.selectors.some((id) => !entries.some((entry) => entry.id === id))) throw new BlogError('必须明确选择有效公开文章。', 2);
    invocation.guided = true;
  }
  if (command === 'series' && !invocation.seriesAction) invocation.seriesAction = await prompts.select('系列管理', [{ name: '查找系列 ID', value: 'search' }, { name: '新建系列', value: 'new' }, { name: '按 ID 插入文章', value: 'add' }, { name: '查看系列列表', value: 'list' }, { name: '查看或修改系列资料', value: 'meta' }]) as Invocation['seriesAction'];
  if ((command === 'search' || command === 'series' && invocation.seriesAction === 'search') && !invocation.selectors.length) invocation.selectors = [await prompts.input('中文名称或关键词（多个关键词用空格分隔）', nonempty)];
  if (command === 'series' && invocation.seriesAction === 'add') {
    if (!invocation.selectors.length) invocation.selectors = [await prompts.input('文章完整 ID（可先用 search 查找）', (value) => postSchema.shape.id.safeParse(value).success ? true : '请输入完整文章 ID。')];
    if (!options.series?.length) options.series = [await prompts.input('系列完整 UUID（可先用 series search 查找）', (value) => seriesRefSchema.shape.id.safeParse(value).success ? true : '请输入完整系列 UUID。')];
    if (options.order === undefined) options.order = Number(await prompts.input('插入章节序号（后续章节加一）', (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? true : '请输入正整数。'));
  }
  if (['meta', 'dev', 'check', 'build', 'publish'].includes(command!) && !options.resume && !invocation.selectors.length && !options.post && !options.series?.length) {
    const scanned = await scanContent(root, config);
    if (command === 'dev') {
      const choice = await prompts.select('预览位置', [{ name: '首页', value: 'home' }, ...scanned.posts.map(articleChoice)]);
      if (choice !== 'home') options.post = choice;
    } else if (command === 'check') {
      if (await prompts.select('检查范围', [{ name: '全部本地文章（含排版样例）', value: 'all' }, { name: '选择文章', value: 'selected' }]) === 'selected') invocation.selectors = await selectArticles(prompts, scanned.posts, true);
    } else if (command === 'meta') {
      const choice = await prompts.select('选择文章或输入手写文档路径', [...scanned.posts.map(articleChoice), { name: '手动输入文档路径', value: 'manual' }]);
      invocation.selectors = [choice === 'manual' ? await prompts.input('文章目录或 Markdown 路径', nonempty) : choice];
      if (!options.init && !options.set?.length && !options.title && !options.slug) await collectMetadata(root, config, invocation, scanned.posts, prompts);
    } else {
      if (command === 'publish' && !config.deploy && !config.pages && !options['pages-remote']) throw new BlogError('尚未配置部署。可先用本地构建检查，或进入配置向导。', 2);
      const catalogue = await scanSeries(root);
      const kind = catalogue.series.length ? await prompts.select('本次更新内容', [{ name: '文章（所属系列资料自动一起更新）', value: 'articles' }, { name: '只更新系列介绍', value: 'series' }]) : 'articles';
      if (kind === 'series') options.series = await prompts.checkbox('选择本次更新的系列资料', catalogue.series.map((source) => ({ name: source.series.title, value: source.series.id })));
      else invocation.selectors = await selectArticles(prompts, scanned.posts.filter((source) => !source.post.fixture), true);
      invocation.guided = true;
    }
  } else if (command === 'meta' && !options.init && !options.set?.length && !options.title && !options.slug) await collectMetadata(root, config, invocation, (await scanContent(root, config)).posts, prompts);
  if (invocation.guided && (['format', 'build', 'publish', 'push', 'unpublish', 'rollback', 'sync', 'restore', 'recover'].includes(command!) || command === 'draft' && ['save', 'export', 'restore', 'undo', 'migrate'].includes(invocation.draftAction!)) && !options['dry-run']) {
    const mode = await prompts.select('执行方式', [{ name: '只查看计划（不提交、不写入、不上线）', value: 'plan' }, { name: command === 'build' ? '确认后本地构建（不上线）' : '查看计划并确认后执行', value: 'execute' }]);
    options['dry-run'] = mode === 'plan';
    if (command === 'build' && mode === 'execute' && !options.export) options.export = await prompts.confirm('是否额外导出到 out/？旧 out 会保留为备份。');
  }
  return invocation;
}
