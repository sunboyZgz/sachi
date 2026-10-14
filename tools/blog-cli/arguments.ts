import { Command, CommanderError, Option } from 'commander';
import { BlogError } from '../../src/lib/blog/files';
import type { ArticleType, BlogConfig } from '../../src/lib/blog/schema';

export type CommandName = 'init' | 'doctor' | 'new' | 'search' | 'series' | 'toy' | 'draft' | 'list' | 'status' | 'meta' | 'format' | 'dev' | 'check' | 'build' | 'publish' | 'push' | 'unpublish' | 'history' | 'rollback' | 'sync' | 'restore' | 'recover' | 'wizard';
export type CliOptions = {
  root?: string; json?: boolean; yes?: boolean; 'dry-run'?: boolean; remote?: boolean;
  category?: string; title?: string; slug?: string; timezone?: string; post?: string;
  type?: ArticleType;
  set?: string[]; init?: boolean; to?: string; resume?: string; destination?: string;
  ignore?: string[]; note?: string;
  'git-remote'?: string; visibility?: string; 'accept-baseline'?: boolean; export?: boolean;
  pages?: boolean; 'pages-remote'?: string; 'setup-pages'?: boolean;
  series?: string[]; order?: number; description?: string;
  file?: string; output?: string; 'video-overflow'?: 'reject' | 'trim-start';
};
export type Invocation = { command?: CommandName; selectors: string[]; options: CliOptions; guided?: boolean; configDraft?: BlogConfig; help?: string; seriesAction?: 'new' | 'list' | 'meta' | 'search' | 'add'; toyAction?: 'add' | 'template' | 'list' | 'check'; draftAction?: 'save' | 'list' | 'show' | 'diff' | 'export' | 'restore' | 'undo' | 'migrate' };

export function createCliProgram(onInvoke: (invocation: Invocation) => void = () => {}, onOutput: (text: string) => void = () => {}): Command {
  const program = new Command().name('blog').description('Sachi Blog · 本地 Markdown 写作与显式发布')
    .option('--root <目录>', '项目目录').option('--json', '机器可读结果，禁用交互')
    .option('--yes', '跳过执行确认，不跳过输入和校验').option('--dry-run', '只查看计划，不写入或部署')
    .helpOption('-h, --help', '显示帮助').addHelpCommand(false).exitOverride()
    .configureHelp({ showGlobalOptions: true })
    .configureOutput({ writeOut: onOutput, writeErr: () => {} });
  program.action(() => {});
  program.addHelpText('after', '\n终端运行 npm run blog 可进入分步向导。原参数命令仍可用于脚本。\nGit 未配置时不提交；publish 必须显式选择文章，不发布全部草稿。');
  const define = (name: CommandName, description: string, args?: string) => {
    const command = program.command(name).description(description).helpOption('-h, --help', '显示此命令帮助');
    if (args) command.argument(args, name === 'push' ? '已构建冻结发布版本的 release-id' : name === 'search' ? '中文名称或多个空格分隔的关键词' : '文章路径、ID 或 slug');
    command.action(() => {
      const raw = command.optsWithGlobals();
      const options = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value])) as CliOptions;
      onInvoke({ command: name, selectors: command.processedArgs.flat().filter((value): value is string => typeof value === 'string'), options });
    });
    return command;
  };
  define('wizard', '分步选择操作，不需要记参数');
  define('init', '配置向导；不建立根项目 Git 仓库或连接服务器')
    .option('--timezone <时区>', 'IANA 时区').option('--git-remote <地址>', '独立内容 Git 仓库')
    .addOption(new Option('--visibility <可见性>', '按仓库实际设置确认').choices(['private', 'public', 'unconfirmed']))
    .option('--pages', '启用 GitHub Pages；目标默认读取根仓库 origin')
    .option('--pages-remote <地址>', '保存 GitHub Pages 目标仓库地址');
  define('doctor', '只读环境检查').option('--remote', '检查已配置的部署环境');
  define('search', '根据中文标题或关键词查找本地文章 ID', '[关键词]');
  define('new', '选择栏目、文章类型，再输入标题')
    .option('--category <栏目>', '闲暇娱乐 / 生活旁白 / 蘸豆！！，或 play/life/learn')
    .option('--title <标题>', '文章标题').option('--slug <slug>', '可选固定 URL；默认使用 UUID')
    .addOption(new Option('--type <类型>', 'article 普通 Markdown / poem 诗歌；未指定时使用模板或普通文章').choices(['article', 'poem']))
    .option('--series <系列>', '所属系列 ID 或 slug', (value: string) => [value]).option('--order <序号>', '章节正整数序号；缺省建议最大值 + 1', Number);
  const series = program.command('series').description('查找、创建系列，或按 ID 插入章节').helpOption('-h, --help', '显示系列帮助');
  series.action(() => onInvoke({ command: 'series', selectors: [], options: series.optsWithGlobals() }));
  for (const action of ['new', 'list', 'meta', 'search', 'add'] as const) {
    const child = series.command(action).description({ new: '创建系列并输出 ID', list: '列出本地系列', meta: '查看或修改系列', search: '根据中文名称或关键词查找系列 ID', add: '按文章和系列完整 ID 插入章节，后续序号加一' }[action]).helpOption('-h, --help', '显示帮助');
    if (action === 'new') child.option('--category <栏目>', '所属栏目').option('--title <名称>', '系列名称').option('--slug <slug>', '固定 URL').option('--description <简介>', '可选纯文字简介');
    if (action === 'meta') child.argument('[series]', '系列 ID 或 slug').option('--set <字段=YAML值>', '修改资料，可重复', (value: string, previous: string[] = []) => [...previous, value]);
    if (action === 'search') child.argument('[关键词]', '中文名称或多个空格分隔的关键词');
    if (action === 'add') child.argument('[文章ID]', '完整文章 ID，不接受名称或 slug')
      .option('--series <系列ID>', '完整系列 UUID', (value: string) => [value]).option('--order <序号>', '插入章节的正整数序号；后续章节统一加一', Number);
    child.action(() => {
      const options = Object.fromEntries(Object.entries(child.optsWithGlobals()).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value])) as CliOptions;
      onInvoke({ command: 'series', seriesAction: action, selectors: child.processedArgs.flat().filter((value): value is string => typeof value === 'string'), options });
    });
  }
  const draft = program.command('draft').description('主动全量留存稿件、查看差异、直接回档与撤销').helpOption('-h, --help', '显示稿件帮助');
  draft.action(() => onInvoke({ command: 'draft', selectors: [], options: Object.fromEntries(Object.entries(draft.optsWithGlobals()).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value])) as CliOptions }));
  for (const action of ['save', 'list', 'show', 'diff', 'export', 'restore', 'undo', 'migrate'] as const) {
    const child = draft.command(action).description({ save: '独立全量保存原文与本地资源；缺失资源时拒绝，可写备注', list: '只读列出全部或某篇文章的稿件历史与实际目录', show: '只读显示一份稿件的原始 Markdown', diff: '对比两份稿件；省略新稿件时对比当前稿', export: '将旧稿与素材导出到独立新目录，不覆盖当前稿', restore: '备份当前文件后，直接恢复指定稿件的正文与资源', undo: '撤销一次回档；回档后有额外编辑时拒绝覆盖', migrate: '把完整的旧对象式稿件转为独立全量目录，保留 ID 与原记录' }[action]).helpOption('-h, --help', '显示帮助');
    if (action === 'save' || action === 'list' || action === 'migrate') child.argument('[article]', '文章 ID、slug 或路径');
    if (action === 'save') child.option('--note <备注>', '稿件阶段或修改原因，最多 1000 字符');
    if (action === 'show' || action === 'export' || action === 'restore') child.argument('[稿件ID]', '完整稿件 UUID，可通过 draft list 查找');
    if (action === 'undo') child.argument('[回档记录ID]', 'draft restore 输出的回档事务 UUID');
    if (action === 'diff') child.argument('[旧稿件ID]', '完整稿件 UUID').argument('[新稿件ID]', '同篇文章的另一稿 UUID；缺省为当前已保存的文章');
    if (action === 'export') child.option('--destination <新目录>', '尚不存在的独立目录，保留原文与素材路径');
    child.action(() => {
      const options = Object.fromEntries(Object.entries(child.optsWithGlobals()).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value])) as CliOptions;
      onInvoke({ command: 'draft', draftAction: action, selectors: child.processedArgs.flat().filter((value): value is string => typeof value === 'string'), options });
    });
  }
  const toy = program.command('toy').description('准备本地作品资料；待媒体处理，不上传或公开').helpOption('-h, --help', '显示作品帮助');
  toy.action(() => onInvoke({ command: 'toy', selectors: [], options: toy.optsWithGlobals() }));
  for (const action of ['add', 'template', 'list', 'check'] as const) {
    const child = toy.command(action).description({ add: '逐项或从 YAML 录入作品，保存为待媒体处理', template: '生成填写模板，不覆盖文件、不生成作品 ID', list: '只读列出作品 ID、路径与待处理状态', check: '只读重新检查作品资料、原媒体变化和公网地址' }[action]).helpOption('-h, --help', '显示帮助');
    if (action === 'add') child.option('--file <YAML文件>', '已填写的作品文件；媒体相对路径以此文件目录为准')
      .addOption(new Option('--video-overflow <策略>', '未来处理超限视频：reject 拒绝；trim-start 保留开头').choices(['reject', 'trim-start']));
    if (action === 'template') child.option('--output <YAML路径>', '写入尚不存在的填写模板');
    if (action === 'check') child.argument('[作品ID]', '完整作品 UUID');
    child.action(() => {
      const options = Object.fromEntries(Object.entries(child.optsWithGlobals()).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value])) as CliOptions;
      onInvoke({ command: 'toy', toyAction: action, selectors: child.processedArgs.flat().filter((value): value is string => typeof value === 'string'), options });
    });
  }
  for (const name of ['list', 'status'] as const) define(name, name === 'list' ? '列出文章' : '查看文章与备份状态').option('--remote', '只读核实服务器当前清单');
  define('meta', '选择文章，查看或修改元数据', '[article]')
    .option('--init', '补齐手写文章的 ID 与创建时间；未填写类型时可选择普通／诗歌')
    .option('--set <字段=YAML值>', '可重复使用', (value: string, previous: string[] = []) => [...previous, value])
    .option('--title <标题>', '修改标题').option('--slug <slug>', '修改从未发布文章的 slug')
    .addOption(new Option('--type <类型>', '切换文章类型：article 普通 Markdown / poem 诗歌').choices(['article', 'poem']));
  define('format', '为选中文章正文补中英文空格；先看差异，再确认写入', '[articles...]')
    .option('--ignore <词语>', '保留词语原写法，可重复；默认保留 A股/B股/H股/A站/B站', (value: string, previous: string[] = []) => [...previous, value]);
  define('dev', '选择首页或文章，启动现有本地预览', '[article]').option('--post <文章>', '预览文章');
  define('check', '检查全部或选中的文章', '[articles...]');
  define('build', '选择文章生成发布包，不上线', '[articles...]').option('--export', '导出到 out/；保留旧目录备份').option('--accept-baseline', '接受全站代码/配置基线变更')
    .option('--series <系列>', '明确更新系列资料，可重复', (value: string, previous: string[] = []) => [...previous, value]);
  define('publish', '明确选择文章并发布，或恢复冻结计划', '[articles...]')
    .option('--series <系列>', '明确更新系列资料，可重复', (value: string, previous: string[] = []) => [...previous, value])
    .option('--resume <release-id>', '恢复原计划，不读取新修订').option('--accept-baseline', '接受全站代码/配置基线变更')
    .option('--pages-remote <地址>', '本次覆盖 blog 分支目标，不更改 origin 或永久配置').option('--setup-pages', '显式启用目标仓库的 GitHub Actions Pages 发布源');
  define('push', '推送冻结发布包；执行已配置的服务器与 Pages 两个钩子', '[release-id]')
    .option('--pages-remote <地址>', '本次覆盖 blog 分支目标；默认读取 pages.remote 或 origin')
    .option('--setup-pages', '显式启用 GitHub Actions Pages 发布源');
  define('unpublish', '选择当前公开文章撤回，保留本地原文', '[articles...]').option('--accept-baseline', '接受全站代码/配置基线变更')
    .option('--setup-pages', '显式启用 GitHub Actions Pages 发布源');
  define('history', '查看发布记录').option('--remote', '核实服务器记录');
  define('rollback', '选择版本整站回滚，不覆盖本地写作').option('--to <release-id>', '目标版本');
  define('sync', '保存全部写作备份，不上线');
  define('restore', '从 Git 恢复到尚不存在的新目录').option('--destination <新目录>', '恢复目标');
  define('recover', '从服务器恢复当前公开快照').option('--destination <新目录>', '恢复目标');
  return program;
}

export function commandCatalog() {
  const program = createCliProgram();
  return program.commands.map((command) => ({
    name: command.name(), description: command.description(), usage: command.usage(),
    options: [...command.options, ...program.options].map((option) => ({ flags: option.flags, description: option.description })),
    subcommands: command.commands.map((child) => ({ name: child.name(), description: child.description(), usage: child.usage(), options: [...child.options, ...program.options].map((option) => ({ flags: option.flags, description: option.description })) })),
  }));
}

export function parseCli(argv: string[]): Invocation {
  let output = ''; let invocation: Invocation | undefined;
  const program = createCliProgram((value) => { invocation = value; }, (text) => { output += text; });
  try { program.parse(argv, { from: 'user' }); }
  catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return { selectors: [], options: { json: argv.includes('--json') }, help: output };
    if (error instanceof CommanderError) throw new BlogError(`参数错误：${error.message}。使用 npm run blog -- --help 查看，或运行 npm run blog 进入向导。`, 2);
    throw error;
  }
  const globals = Object.fromEntries(Object.entries(program.opts()).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value])) as CliOptions;
  if (invocation?.options.resume && (invocation.selectors.length || invocation.options.series?.length)) throw new BlogError('恢复冻结计划不能同时选择新文章或系列资料。请只使用 publish --resume <release-id>。', 2);
  return invocation ?? { selectors: [], options: globals };
}
