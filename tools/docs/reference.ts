import { commandCatalog } from '../blog-cli/arguments';

const details: Record<string, { guide: string; notes: string; examples: string[] }> = {
  storage: { guide: '/setup/yandu', notes: '凭证优先从私密 JSON 文件读取，仅文件不存在时使用环境变量保底；init 建立可重试目录绑定，sync 全量保存原稿、稿件与关联资料，READY 并回读摘要后才记录 saved。断网本地继续编辑，恢复后重试；云端基线冲突需恢复到新目录核对。avatar 先保留原件与旧资料，再关联个人配置。upload 本身不开放匿名读取。restore 只写新目录并验证所有文件。', examples: ['blog storage init --yes', 'blog storage status', 'blog storage sync --dry-run', 'blog storage sync --yes', 'blog storage sync --resolve <分支A> --resolve <分支B> --yes', 'blog storage list', 'blog storage restore <检查点> --destination ../sachi-recovery --yes', 'blog storage avatar head --file ./head.png --yes', 'blog storage upload article <文章ID> --file ./video.mp4 --yes'] },
  draft: { guide: '/writing/drafts', notes: 'save 只在主动调用时独立全量复制一稿，保存原文、备注和完整本地素材；正文与排版参数可未完成，但缺失资源和远端媒体会拒绝，不绑定编辑、格式化或发布。新式文章保存整个本篇目录，旧文章复制引用的共享素材；每稿在 .blog-store/drafts/versions/<文章ID>/<稿件ID>，可直接打开或独立备份。restore 先持久备份当前实际文件，再直接恢复正文与资源；undo 撤销回档，额外编辑时拒绝覆盖。写入失败回滚，中断后重试先恢复；dry-run 不恢复事务。list/show/diff 只读，export 只写独立新目录；migrate 保留 ID、时间、备注与旧记录，仅转换资源齐全的旧稿。全部操作不自动上传、不改公开集合，也不纳入现有 sync。', examples: ['blog draft save <文章> --note "初稿" --dry-run', 'blog draft save <文章> --note "重写了结尾" --yes', 'blog draft list <文章> --json', 'blog draft restore <稿件ID> --dry-run', 'blog draft restore <稿件ID> --yes', 'blog draft undo <回档记录ID> --yes', 'blog draft diff <旧稿件ID> <新稿件ID>', 'blog draft export <稿件ID> --destination ./draft-review/first --yes', 'blog draft migrate <文章> --dry-run'] },
  format: { guide: '/writing/format', notes: '只给明确选中文章的正文补中英文空格；支持强调和链接文字，保护代码、公式、自动网址、图片、引用定义、链接目标与 frontmatter。保留原换行、注释和行尾空格；默认保留 A股/B股/H股/A站/B站，--ignore 可重复。先展示逐行差异，确认后事务写入；--dry-run 不写入或恢复，不绑定构建发布，无需修改时返回 UNCHANGED。', examples: ['blog format <文章> --dry-run', 'blog format <文章> --yes', 'blog format <文章A> <文章B> --ignore "维生素B12" --dry-run --json'] },
  toy: { guide: '/writing/toys', notes: 'add 逐项引导或从 --file YAML 录入，必填名称、简介、本地封面、本地视频、公网地址及未来超限策略。媒体须可解码，项目地址须能匿名访问。保存原文件引用和摘要，状态固定为待媒体处理；不上传、不压缩、不裁剪，不进入舞台或公开集合。template 不生成作品 ID，不覆盖目标。list/check 只读，check 发现源文件变化则拒绝并保留原登记摘要。--video-overflow 可覆盖文件策略；--yes 不隐含裁剪授权。Yandu 通用能力验收见 /reference/yandu-acceptance。', examples: ['blog toy add', 'blog toy template --output ./toy.yaml', 'blog toy add --file ./toy.yaml --dry-run', 'blog toy add --file ./toy.yaml --yes', 'blog toy check <作品ID>', 'blog toy list --json'] },
  series: { guide: '/writing/series', notes: 'search 按中文名称列出候选 ID；new 创建后输出 ID。add 只接受完整文章 ID 和系列 UUID，拒绝已经归组的文章，将序号不小于插入点的所有本地章节加一；修改采用可恢复事务，不自动上线。new/list/meta 保持原用法；章节发布时冻结所属系列资料。', examples: ['blog series search "我学会了"', 'blog series new --category play --title "我学会了"', 'blog series add <文章ID> --series <系列ID> --order 2 --dry-run', 'blog series list --json', 'blog series meta <系列> --set \'description=按顺序留下学习记录。\''] },
  search: { guide: '/writing/find', notes: '只读取本地正式文章的名称和身份，不检查未完成正文或缺失图片，也不查询服务器。中文关键词和轻微错字使用 Fuse.js 匹配；多个空格分隔的关键词必须全部匹配。输出所有候选及 ID，不自动选择或修改文章。', examples: ['blog search "朝思暮想"', 'blog search "博客 玩具"', 'blog search "朝思暮想" --json'] },
  wizard: { guide: '/start/menu', notes: '无命令的交互入口也会打开菜单；没有终端或 --json 模式不允许问答。', examples: ['npm run blog', 'blog', 'blog wizard'] },
  init: { guide: '/start/configure', notes: '配置向导不创建远端或连接服务器。--yes 的无参数调用保留现有配置，仅创建缺失目录和模板。', examples: ['blog init', 'blog init --timezone Asia/Shanghai --dry-run'] },
  doctor: { guide: '/start/doctor', notes: '可选工具缺失只影响相应功能；--remote 查询已配置的服务器或 Pages，不执行发布。环境报告不等于文章检查或 Actions 权限验收。', examples: ['blog doctor', 'blog doctor --remote'] },
  new: { guide: '/writing/new', notes: '交互式依次选择栏目、普通／诗歌类型和标题。--type article/poem 可直接指定；脚本未指定时沿用 post.md 模板类型或普通文章。诗歌使用 templates/poem.md，缺失时使用内置逐行模板。--yes 不填写必要输入，--json／非终端必须明确提供栏目和标题。slug 默认生成 UUID。', examples: ['blog new', 'blog new --category life --title "秋天的一杯茶" --type article --dry-run', 'blog new --category life --title "寄给春天的信" --type poem'] },
  list: { guide: '/preview/status', notes: '与 status 共用文章状态；fixture 不作为正式文章列出。本地缓存不能证明线上状态。', examples: ['blog list', 'blog list --remote'] },
  status: { guide: '/preview/status', notes: '服务器 current 或匹配的 Pages 标记才核实公开状态；普通远端查询可保存已核实清单，--dry-run 不保存。双目标时文章列表依服务器，Pages 单独展示；未配置目标时 --remote 也无法证明上线。', examples: ['blog status --remote', 'blog status --remote --dry-run --json'] },
  meta: { guide: '/writing/edit-meta', notes: '只修改选中字段，保留 YAML 注释与正文。菜单和 --type article/poem 可切换文体；--set type=null 恢复旧文章的缺省普通排版。诗歌与 flow 不能同时启用，可同时 --set flow=null。--init 补身份，在终端为未写 type 的手写文章提供选择，已有类型保留；--set 值采用 YAML，可重复。曾发布 slug 不可改。', examples: ['blog meta <文章>', 'blog meta <文章> --type poem --dry-run', "blog meta <文章> --set 'tags=[日常,记录]' --dry-run", 'blog meta <文章目录> --init --type poem --yes'] },
  dev: { guide: '/preview/dev', notes: '读取当前本地工作内容，启动现有 Next 开发服务器；排版测试样例仅由显式 fixture 预览加载。不自动打开浏览器，默认 127.0.0.1:4173。', examples: ['blog dev', 'blog dev --post <文章>', 'blog dev --post <文章> --dry-run'] },
  check: { guide: '/preview/check', notes: '参数模式不选择文章时检查全部本地内容。检查通过不等于完整构建通过，也不执行上线。', examples: ['blog check', 'blog check <文章A> <文章B> --json'] },
  build: { guide: '/release/build', notes: '必须明确选择正式文章，生成 BUILD_ONLY 包而不是上线。--export 将旧 out 保留为备份；不做 Git 上传。', examples: ['blog build <文章> --dry-run', 'blog build <文章> --yes --export'] },
  publish: { guide: '/release/publish', notes: '候选集合是旧成功清单加明确冻结修订。--resume 不能同时选择新文章。参数方式接受基线需 --accept-baseline。', examples: ['blog publish <文章> --dry-run', 'blog publish <文章> --yes', 'blog publish --resume <release-id> --yes'] },
  push: { guide: '/setup/github-pages', notes: '只推送明确选中的完整冻结包，不读取工作草稿，不提交或推送 main。调用 push 会启用 Pages 目标解析；目标依次取本次 --pages-remote、pages.remote、根 origin 的 push URL。服务器未配置则跳过；服务器单目标继续原计划应使用 publish --resume，不把 push 当服务器别名。一次性覆盖不保存给后续 status。PUSHED 是 Actions 排队，不等于已上线。', examples: ['blog push', 'blog push <release-id> --dry-run', 'blog push <release-id> --setup-pages --yes', 'blog push <release-id> --pages-remote git@github.com:OWNER/REPO.git --dry-run'] },
  unpublish: { guide: '/release/unpublish', notes: '从当前公开集合明确撤回，不删除本地文件；仍被其他公开文章引用时需先处理这些链接。', examples: ['blog unpublish <文章> --dry-run', 'blog unpublish <文章> --yes'] },
  history: { guide: '/release/history', notes: '默认是本地执行记录；--remote 的 server 查询部署记录，pages 仅查询当前核实状态，不是完整 Actions 历史。未配置的目标显示 SKIPPED；BUILD_ONLY 和 PUSHED 都不能单独证明上线。', examples: ['blog history', 'blog history --remote'] },
  rollback: { guide: '/release/rollback', notes: '仅支持服务器单目标；启用 Pages 时明确拒绝，不自动只回滚其中一端。整站切换到历史成功版本，原稿不覆盖；核对恢复和移除的全部条目。', examples: ['blog rollback --to <release-id> --dry-run', 'blog rollback --to <release-id> --yes'] },
  sync: { guide: '/backup/sync', notes: '全部写作备份可能包含草稿；未配置 Git 则跳过，不创建根仓库，不改变公开网站。', examples: ['blog sync --dry-run', 'blog sync --yes'] },
  restore: { guide: '/backup/restore', notes: '恢复内容 Git 分支到尚不存在的新目录，不恢复网站代码或覆盖当前写作。', examples: ['blog restore --destination <新目录> --dry-run', 'blog restore --destination <新目录> --yes'] },
  recover: { guide: '/backup/recover', notes: '仅从 deploy 服务器当前公开包下载并校验，不支持 Pages-only。原稿恢复到尚不存在的新目录，代码与文章快照补齐到本项目持久存储，不覆盖 src 或当前原稿。未公开草稿无法恢复。', examples: ['blog recover --destination <新目录> --dry-run', 'blog recover --destination <新目录> --yes'] },
};

const escapeTable = (text: string) => text.replaceAll('|', '\\|');

export function referencePages(): Record<string, string> {
  const commands = commandCatalog();
  const pages: Record<string, string> = {};
  for (const command of commands) {
    const detail = details[command.name];
    if (!detail) throw new Error(`命令 ${command.name} 缺少手册关联。`);
    const subcommands = command.subcommands.map((child) => `### ${child.name}\n\n\`blog ${command.name} ${child.name} ${child.usage}\`\n\n${child.description}\n\n| 参数 | 含义 |\n| --- | --- |\n${child.options.map((option) => `| \`${escapeTable(option.flags)}\` | ${escapeTable(option.description)} |`).join('\n')}\n`).join('\n');
    pages[`reference/commands/${command.name}.md`] = `---
title: ${command.name} 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# ${command.name} 命令

${command.description}。[按步骤完成这项操作 →](${detail.guide})

## 使用方式

\`blog ${command.name} ${command.usage}\`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 \`npm run blog --\`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
${command.options.map((option) => `| \`${escapeTable(option.flags)}\` | ${escapeTable(option.description)} |`).join('\n')}
| \`-h, --help\` | 显示帮助，不执行 |

${subcommands ? `## 子命令\n\n${subcommands}\n` : ''}## 示例

\`\`\`sh
${detail.examples.join('\n')}
\`\`\`

## 输入与执行边界

${detail.notes}

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 \`npm run --silent blog -- <命令> --json\`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
`.replaceAll('\\`', '`');
  }
  pages['reference/commands.md'] = `---
title: 全部命令与参数
scope: reference
---

# 全部命令与参数

不想记参数时运行 \`npm run blog\`，或已安装的 \`blog\`。这里的每条命令都关联具体操作教程，参数直接取自实际 Commander 定义。

## 命令索引

| 命令 | 作用 |
| --- | --- |
${commands.map((command) => `| [${command.name}](/reference/commands/${command.name}) | ${escapeTable(command.description)} |`).join('\n')}

## 全局选项

| 选项 | 行为 |
| --- | --- |
| --root | 指定项目目录，避免在错误位置操作 |
| --json | 机器可读结果，禁用交互；必要输入仍须提供 |
| --yes | 跳过最终执行确认，不自动输入或全选 |
| --dry-run | 只看计划，不写快照、提交或上线；可只读查服务器 |
| --help | 显示命令帮助 |

## 两种调用方式

\`\`\`sh
# 不改全局环境
npm run blog -- publish <文章> --dry-run
# 注册本机命令后
blog publish <文章> --dry-run
# 脚本读取 JSON，避免 npm 打印脚本名称
npm run --silent blog -- status --json
\`\`\`

每次无参数菜单执行一项后退出。输入取消返回 130；未知参数拒绝执行，不会默默忽略。[错误处理](/troubleshooting/errors)

## 文章参数怎么填

文章操作接受实际 slug、完整 id、项目相对 Markdown 路径或文章日期目录。例如本地教程生成的 autumn-tea 可写成 \`blog check autumn-tea\`，也可用实际的 \`content/生活旁白/日期/index.md\`。它们是同一篇的不同选择方式，不是标题或浏览器 URL；路径有空格时用引号包住。

push 接受的是已构建包的 release-id，rollback 的 --to 和 publish 的 --resume 也是版本 ID；不要传文章 UUID。restore / recover 的 --destination 是尚不存在的新目录，不是当前 content。[身份与版本区别](/reference/publishing)

## 脚本结果与执行确认

成功 JSON 为 \`{ command, status, data }\`；错误为 \`{ status, error, code, details? }\`。进程退出码 0 可能只是 PLANNED、SKIPPED 或 BUILD_ONLY，必须同时判断状态。执行有影响的操作时，非交互模式需要 --yes；它不替代 --accept-baseline，也不自动提供文章、目标或恢复目录。

--dry-run 不是离线开关，已配置目标仍可能只读查询远端。对文件修改操作可先预演，但 dev --dry-run 只打印启动地址 / 命令，不真的启动服务器；new --dry-run 不创建文章或生成可使用的文章身份。自定义块源码和真实效果见[文章契约](/reference/content)。
`.replaceAll('\\`', '`');
  return pages;
}
