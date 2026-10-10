import { Command, CommanderError, Option } from 'commander';
import { BlogError } from '../../src/lib/blog/files';
import type { BlogConfig } from '../../src/lib/blog/schema';

export type CommandName = 'init' | 'doctor' | 'new' | 'series' | 'list' | 'status' | 'meta' | 'dev' | 'check' | 'build' | 'publish' | 'push' | 'unpublish' | 'history' | 'rollback' | 'sync' | 'restore' | 'recover' | 'wizard';
export type CliOptions = {
  root?: string; json?: boolean; yes?: boolean; 'dry-run'?: boolean; remote?: boolean;
  category?: string; title?: string; slug?: string; timezone?: string; post?: string;
  set?: string[]; init?: boolean; to?: string; resume?: string; destination?: string;
  'git-remote'?: string; visibility?: string; 'accept-baseline'?: boolean; export?: boolean;
  pages?: boolean; 'pages-remote'?: string; 'setup-pages'?: boolean;
  series?: string[]; order?: number; description?: string;
};
export type Invocation = { command?: CommandName; selectors: string[]; options: CliOptions; guided?: boolean; configDraft?: BlogConfig; help?: string; seriesAction?: 'new' | 'list' | 'meta' };

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
    if (args) command.argument(args, name === 'push' ? '已构建冻结发布版本的 release-id' : '文章路径、ID 或 slug');
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
  define('new', '选择三个栏目之一，再输入标题')
    .option('--category <栏目>', '闲暇娱乐 / 生活旁白 / 蘸豆！！，或 play/life/learn')
    .option('--title <标题>', '文章标题').option('--slug <slug>', '可选固定 URL；默认使用 UUID')
    .option('--series <系列>', '所属系列 ID 或 slug', (value: string) => [value]).option('--order <序号>', '章节正整数序号；缺省建议最大值 + 1', Number);
  const series = program.command('series').description('新建、列出或修改系列资料').helpOption('-h, --help', '显示系列帮助');
  series.action(() => onInvoke({ command: 'series', selectors: [], options: series.optsWithGlobals() }));
  for (const action of ['new', 'list', 'meta'] as const) {
    const child = series.command(action).description({ new: '创建系列', list: '列出本地系列', meta: '查看或修改系列' }[action]).helpOption('-h, --help', '显示帮助');
    if (action === 'new') child.option('--category <栏目>', '所属栏目').option('--title <名称>', '系列名称').option('--slug <slug>', '固定 URL').option('--description <简介>', '可选纯文字简介');
    if (action === 'meta') child.argument('[series]', '系列 ID 或 slug').option('--set <字段=YAML值>', '修改资料，可重复', (value: string, previous: string[] = []) => [...previous, value]);
    child.action(() => {
      const options = Object.fromEntries(Object.entries(child.optsWithGlobals()).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value])) as CliOptions;
      onInvoke({ command: 'series', seriesAction: action, selectors: child.processedArgs.flat().filter((value): value is string => typeof value === 'string'), options });
    });
  }
  for (const name of ['list', 'status'] as const) define(name, name === 'list' ? '列出文章' : '查看文章与备份状态').option('--remote', '只读核实服务器当前清单');
  define('meta', '选择文章，查看或修改元数据', '[article]')
    .option('--init', '补齐手写文章的 ID 与创建时间')
    .option('--set <字段=YAML值>', '可重复使用', (value: string, previous: string[] = []) => [...previous, value])
    .option('--title <标题>', '修改标题').option('--slug <slug>', '修改从未发布文章的 slug');
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
