# Blog CLI 开发完成版使用说明

更细的逐步教程已整理为独立 [CLI 手册网站](../docs-site/index.md)。运行 `npm run docs:install` 后，用 `npm run docs:dev` 在 `http://127.0.0.1:4174` 阅读；构建和部署说明见 [维护手册站](../docs-site/reference/docs-site.md)。本文保留命令与技术契约总览。

入口：`npm run blog`（分步菜单）或 `npm run blog -- <命令>`（直接进入操作）。代码在根项目 `tools/blog-cli/`，不修改视觉交接包。无需全局安装，无 Git 仓库也能写作、校验、预览和构建；未配置 Git 时不提交，未配置部署时不声称已上线。

## 快速开始

不需要记参数时，运行：

```sh
npm run blog
```

执行 `npm link` 注册本机命令后，只输入 `blog` 同样进入菜单。不希望改动全局环境时使用原 npm 入口；无需注册命令也可运行 `./bin/blog.mjs`。

终端中会出现操作菜单，选中一项后逐步输入，完成一次操作后退出。也可以用 `npm run blog -- wizard` 显式进入菜单。↑/↓ 移动，Enter 选择；多选使用空格勾选，再 Enter 确认；Ctrl+C 取消当前操作。

分步流程包括：

- 新建：选择三个固定栏目之一 → 输入标题。
- 预览与检查：选择首页 / 文章，或检查全部 / 选中的文章。
- 文章信息：选择文章 → 查看、修改或补齐身份 → 勾选字段 → 输入新值 → 查看变更并确认。支持标题、标签、摘要、封面、状态、阅读分钟数、精选与未发布 slug；复杂 `flow` 等字段继续使用 Markdown 或 `--set`。
- 正文空格：选择文章 → 先看逐行差异 → 确认后补中英文空格。`blog format <文章> --dry-run` 预演，`--yes` 明确执行；`--ignore "维生素B12"` 可重复保留例外词语。保护代码、公式、链接目标和 frontmatter，保持原换行与行尾空格，不自动发布。完整用法见[正文空格整理](../docs-site/writing/format.md)。
- 稿件留存：`blog draft save <文章> --note "初稿"` 主动全量保存想纪念的阶段，每稿是含正文、完整素材和预设的独立普通目录，资源缺失时拒绝保存。`draft list/show/diff` 查看历史、原文与差异，`draft restore <稿件ID>` 先备份当前实际文件，再直接回档正文与素材；`draft undo <回档记录ID>` 撤销回档，额外编辑时拒绝覆盖。`draft export` 取回到新目录，`draft migrate` 将资源齐备的旧稿转成完整目录并保留 ID 与备注。历史在 `.blog-store/drafts/`，不自动保存每次编辑、上传或发布，也不纳入现有 sync。完整用法见[稿件留存与回档](../docs-site/writing/drafts.md)。
- 构建 / 发布：勾选正式文章 → 只看计划 / 确认后执行 → 查看选中、保留旧快照与排除的数量 → 确认。排版样例不进入发布选择；默认没有任何文章被勾选。
- 推送：选择已经构建的冻结版本 → 核对配置/origin 或仅本次目标 → 只看计划 / 确认执行。服务器与 GitHub Pages 两个已配置钩子分别记录结果；main 不变，Pages 推送不等于已经上线。完整配置与逐步操作见 [main / blog 与 GitHub Pages](../docs-site/setup/github-pages.md)。
- 撤回：从服务器当前公开清单选择，即使本地原文已丢失也能选择；不会删除本地文件。
- 回滚：从服务器成功发布历史选择整站版本；继续发布则从本地尚未完成的冻结计划中选择，不采用新的文章修订。
- 备份 / 恢复：区分不上线的全部写作备份与已公开内容恢复；恢复目录必须尚不存在，不覆盖当前项目。
- 配置：逐步输入时区，保留 / 配置 / 停用 Git 和部署，最后确认写入。不会创建根 Git 仓库、查询仓库可见性、连接服务器或自动安装服务。仓库可见性必须按实际设置确认。

菜单中的构建、发布、撤回、回滚、备份与恢复，默认首先选择“只查看计划”。执行确认默认取消；全站代码基线变化时还需单独接受。未配置 Git 的备份操作会明确跳过；未配置部署时不会发布。直接运行 `new`、`meta`、`dev`、`check`、`build`、`publish`、`unpublish`、`rollback`、`restore`、`recover` 或无参数 `init`，也会在终端中补齐缺失的输入。

日常新建也可直接运行：

```sh
npm run blog -- new
```

用 ↑/↓ 从“闲暇娱乐 / 生活旁白 / 蘸豆！！”三个目录中选择，回车确认，再输入标题。无需填写 slug，默认由新生成的 UUID 决定；ID、创建时间、文章模板与 assets 目录自动生成。标题为空时会提示重输；在栏目选择或标题输入阶段按 Ctrl+C 取消，不留下文章或空目录。

也可只提供 `--title "标题"`，再选择栏目；或只提供 `--category life`，再输入标题。完整参数方式继续支持脚本：

```sh
npm ci
npm run blog -- init --yes
npm run blog -- new --category "生活旁白" --title "秋天的一杯茶" --slug a-cup-of-tea
npm run blog -- list
npm run blog -- check content/生活旁白/2026-10-02
npm run blog -- dev --post a-cup-of-tea
npm run blog -- build a-cup-of-tea --dry-run
npm run blog -- build a-cup-of-tea --yes --export
```

非交互终端和 `--json` 模式不显示菜单。没有具体命令时显示帮助；`wizard --json` 会报输入错误。脚本必须提供必要输入，例如新建的 `--category` 与 `--title`、构建 / 发布的文章选择、回滚的 `--to`、恢复的 `--destination`。`--yes` 不会自动选择栏目、全选文章或填写标题。`new --dry-run` 同样校验输入，但不创建文件。

新建目录以配置时区计算创建日期；同日第二篇加 `-02`，并发新建不会覆盖。日期请使用 `new` 实际输出的路径，不照搬示例。ID 是 UUID，固定不变；URL 是 `/article/<slug>/`。修改目录或栏目不改 URL，曾发布文章包括撤回后都不能直接修改 slug。

`--export` 将已校验的本地发布包复制到 `out/`；旧 `out/` 会移动到 `.blog/export-backups/`，不会合并遗留已撤回页面。只构建不改变线上状态。所有命令支持 `--root <项目目录>`；读写命令支持 `--dry-run`；需要确认的操作在无交互终端中必须显式传 `--yes`。`--yes` 只跳过确认，不跳过校验。`--json` 输出机器可读结果，构建日志与错误日志不混入 JSON。

脚本解析 stdout 时可使用 `npm run --silent blog -- status --json`，避免 npm 自身打印脚本名称；某个命令的完整参数用 `npm run blog -- <命令> --help` 查看。

## 写作契约

```text
.blog-store/content/
  生活旁白/
    2026-10-02/
      index.md
      assets/
        cover.png
        demo.mp4
      media.yaml       # 可选
```

```yaml
---
id: "<new 生成的 UUID>"
title: 秋天的一杯茶
slug: a-cup-of-tea
createdAt: "2026-10-02T09:30:00+08:00"
tags: [日常]
cover: ./assets/cover.png
featured: false
---
```

栏目由目录映射为 play/life/learn。日期默认使用创建时间在配置时区的日期，发布后显示首次发布时间。阅读分钟数默认计算，也可用 `minutes` 覆盖；项目文章可设置 `status`，默认“记录”。`summary`、`tags`、`cover`、`featured` 均可选。原来的扁平 Markdown 与 fixture 仍能本地预览，但 fixture 明确禁止发布。新文章不复制头像；通过 `storage avatar` 关联个人资料中的 Yandu 对象版本，原 `src/assets/avatar/` 保留为回退。

图片和视频都采用 `![说明](./assets/文件名)`；视频使用原生控件、poster、`preload="metadata"`，不自动播放。下载附件使用 `[下载](./assets/文件.pdf)`。支持引用式 Markdown 图片/链接，不把代码块中的示例当成真实依赖，不启用任意 HTML。附件仅限本篇 assets，拒绝越界路径、符号链接和不允许的扩展名。

站内链接可写 `[文章](blog:<文章UUID>)` 或 `/article/<slug>/`；发布检查要求目标也在候选公开集合，不自动发布目标草稿。外部普通链接不做强制联网校验。

图片、视频、封面和轮廓必须是本篇本地资源，才能冻结旧版本；不以外链图片替代可恢复源文件。未引用资源的处理预设不会把它们带入公开产物。

`new` 读取 `templates/post.md`。模板可仅有正文，也可带默认 tags/status 等 frontmatter；每次都重新生成 ID、创建时间，并采用命令提供的标题和 slug，不继承模板的 fixture 或栏目。

元数据保留 YAML 注释、其他字段，以及正文的换行、尾随空格与空行：

```sh
npm run blog -- meta a-cup-of-tea
npm run blog -- meta a-cup-of-tea --set 'tags=[日常,记录]' --set 'featured=true' --yes
npm run blog -- meta content/生活旁白/2026-10-02 --init --yes
```

环绕继续使用 frontmatter `flow`，不引入 `layout.yaml`：

```yaml
flow:
  image: ./assets/cup.png
  width: 240 # 可选，保持原始比例
  # contour: ./assets/cup-contour.json # 可选；省略时从 alpha 自动生成
  defaultX: 0.53
  defaultY: 86
```

正文中的配置独立图片与相邻连续纯文本自动识别成局部区域，不依赖标题。任意标题、分隔线、富文本和其他普通块是边界；多张配置图片在同一候选区时必须分隔。flow 保留单图对象，支持各图独立配置数组。同一资源重复出现可复用配置。横竖图按完整画布比例显示，width 为显示宽度（96–360 px，默认 205），容器不足才缩小，没有高度上限；替代文字取自 Markdown，flow.alt 可覆盖。省略 contour 时从 alpha 生成哈希轮廓，不透明图按矩形处理。所有源图与手工轮廓进入冻结快照，自动轮廓由冻结源图生成。移动端、打印、无 JavaScript 与引擎错误保留原顺序和完整普通 DOM。

写法与轮廓契约见[环绕手册](../docs-site/writing/flow.md)。公开个人信息只在 `src/config/profile.json` 配置；正式域名只在 `blog.config.json.siteUrl` 配置，见[个人资料](../docs-site/setup/profile.md)、[SEO 检查](../docs-site/setup/seo.md)和[目录职责](../docs-site/reference/project-structure.md)。预览/fixture/未配域名页面不收录，正式 SEO 只读发布清单。

`media.yaml` 示例：

```yaml
assets:
  ./assets/screenshot.png:
    preset: screenshot
  ./assets/cover.jpg:
    preset: photo
    widths: [640, 1280, 1920]
    quality: 85
  ./assets/demo.mp4:
    poster: ./assets/poster.png
```

照片等比缩放，不放大，生成 WebP/srcset；截图、透明图与环绕图无损输出，GIF/多帧资源保留动画。短视频探测时长后转 H.264/AAC MP4，不剪辑、不静默删音轨。FFmpeg/ffprobe 只在检查或发布视频时需要。默认 180 秒、普通 Git 源文件最大 100 MiB，均可在配置中调整；不自动启用 LFS。原素材始终不覆盖。

## 配置与正式接入

`blog.config.json` 可省略未配置字段，运行时用 Zod 验证。示例：

```json
{
  "schemaVersion": 1,
  "timezone": "Asia/Shanghai",
  "contentDir": ".blog-store/content",
  "siteUrl": "https://blog.example.com",
  "codeRef": null,
  "git": {
    "remote": "git@github.com:YOUR_ACCOUNT/YOUR_CONTENT_REPO.git",
    "branch": "content-source",
    "visibility": "private"
  },
  "deploy": {
    "type": "ssh",
    "host": "blog-prod",
    "root": "/srv/mutouren"
  }
}
```

`git` 与 `deploy` 默认均为 null。Git 是配置后的正式功能，使用 `.blog/git-content` 独立内容 checkout，不使用根项目 index，不 stash/reset/checkout 用户工作区，不强推；根项目可以一直没有 Git 仓库。远端有其他设备的新提交时拒绝自动覆盖。`visibility` 未确认时拒绝上传。提交时关闭该隔离仓库的 hooks，不运行备份仓库中的构建代码。

`codeRef: null` 冻结当前网站代码和全局资源并记录摘要；指定 Git ref 时读取该已提交的前端版本，并要求依赖锁与本地安装基线匹配。转换流水线也纳入构建基线。全站代码、头像、配置或转换基线改变后，参数调用需显式 `--accept-baseline`，向导会显示计划并单独询问是否接受；未选文章仍使用旧源快照。

SSH 使用已配置的主机别名，严格验证已知主机指纹；首次连接先由使用者正常确认。服务器只需 OpenSSH、Python 3（标准库部署辅助程序）及现有静态服务，不需要 Node.js，也不会自动安装或修改 Nginx。发布目录必须是专用绝对目录；有非本工具文件的目录会拒绝接管，建议配置新目录。

Nginx 示例，需使用者在正式接入时配置，不由发布命令修改：

```nginx
root /srv/mutouren/current;
location / { try_files $uri $uri/ =404; add_header Cache-Control "no-cache"; }
location /media/ {
    alias /srv/mutouren/shared/media/;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
location /versions/ {
    alias /srv/mutouren/shared/versions/;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
location = /release-marker.json { add_header Cache-Control "no-store"; }
```

只公开 current、shared/media 与 shared/versions。**绝不能把 `/srv/mutouren/` 整个设为公开根**：release.json、源快照、代码副本、staging 和 records 都是私有资料。版本化 JS/CSS/头像与封面等全局资源都位于 `/versions/<release-id>/`；旧页面仍能请求旧资源。第一版没有自动清理历史包或共享媒体。

本地部署器用于验收：`{"type":"local","root":"/绝对路径/专用测试目录"}`，也执行相同校验、锁、原子切换和恢复逻辑；不要把它当成公网已上线。

正式静态站点的站内导航读取完整 HTML，避免旧 App Router 页面数据与新部署混用；本地开发仍使用 Next.js Link。

## 发布、备份与恢复

```sh
npm run blog -- publish a-cup-of-tea --dry-run
npm run blog -- publish a-cup-of-tea --yes
npm run blog -- status --remote
npm run blog -- history --remote
npm run blog -- unpublish a-cup-of-tea --dry-run
npm run blog -- rollback --to r-<实际 release-id> --dry-run
npm run blog -- publish --resume r-<实际 release-id> --yes
npm run blog -- sync --dry-run
npm run blog -- sync --yes
npm run blog -- restore --destination /绝对路径/不存在的新目录 --yes
npm run blog -- recover --destination /绝对路径/不存在的公开内容恢复目录 --yes
```

发布公式：服务器当前成功清单＋明确选中的冻结修订－明确撤回条目。A 本地修改时发布 B，A 的文字、封面、图片与轮廓仍取旧快照；不是扫描全部文章过滤 draft。发布会冻结源文件、检查确认后变化，Git 配置后先保存可达快照，再隔离构建与本地 HTTP 检查，上传校验，服务器锁下比较基线并原子切换；健康检查失败恢复旧 current。

`--dry-run` 不提交、不上传、不部署、不写 current；有部署配置时可以只读查询服务器。默认 status/history 标明缓存来源，不能据缓存声称已核实线上。`sync` 只备份全部写作文件及补记发布结果，不改变网站。撤回不删除本地原文，也不承诺删除互联网缓存；被其他公开文章链接的目标需先显式修改并发布这些链接。

`.blog/` 是可重建缓存；**`.blog-store/` 是持久数据，不要当缓存删除**，其中保存 snapshots、code、plans、releases、receipts、current.json 和 Git 基线。它不放在 public，也不由旧 sync 整体上传；现在可通过 `npm run backup` 作为独立私有 Git 仓库完整备份，见[资料备份](../docs-site/backup/store.md)。Git 未启用时，发布包会把公开版本的源快照和冻结代码保存在服务器私有发布目录；`recover` 能从该包恢复，但无法恢复从未备份或发布的草稿。

Git 内容分支保存原文备份、`.snapshots/<revisionHash>` 和 `.release/`。删除 `.blog/` 不会丢失 Git 基线；远端推送冲突不会用 force 解决。`restore` 只克隆到新目录，不覆盖现有写作目录；不恢复网站源代码。服务器 current 才是上线事实。

恢复冻结发布不重新扫描文章；有完整包时复用它，构建失败后可以从原计划、源快照和冻结代码重建。如果流水线本身已经改变，会阻止旧计划重建，要求恢复原流水线或重新计划。切换后 SSH 中断会查询实际 current，无法查询则返回 UNKNOWN；网站已上线但 Git 记录保存失败返回 DEPLOYED_UNSYNCED，`sync` 可补记。

退出码：0 成功，2 输入/配置，3 内容/媒体，4 并发/基线变化，5 Git，6 构建，7 部署或 UNKNOWN，8 DEPLOYED_UNSYNCED，130 取消。

## 验证

`npm run check` 覆盖命令解析、真实提示组件、向导输入、取消不写入、JSON 非交互、子进程适配，以及写作、AST、快照、单篇隔离、真实临时 Git 远端、本地部署事务与恢复。`npm run test:cli:next` 在临时项目中执行真实 Next.js 发布构建，验证环绕、媒体映射、头像哈希、短视频与草稿排除。`npm run build` 从当前发布快照导出，无记录时生成空站；`npm run build:fixtures` 明确生成本地排版样例，不能用于部署。`npm run test:browser` 保留原有响应式、Pretext 和头像回归。

自动化不连接真实 GitHub 或云服务器。真实 SSH、公网 TLS/Nginx、账号权限和主机指纹需要正式接入后验收。

## CLI 维护结构

通用能力采用 Commander.js（严格命令解析与帮助）、Inquirer（选择、多选、输入与默认取消的确认）和 Execa（无 shell 子进程执行、超时和输出）。业务约束继续保留项目实现，不把快照隔离和部署事务交给普通文件同步代替。

`index.ts` 仅编排入口；`arguments.ts` 定义命令；`prompts.ts` 适配终端提示；`wizard.ts` 补齐分步输入；`context.ts` 统一执行确认；`reporter.ts` 提供可读计划与状态。`commands/` 按写作、备份恢复、发布回滚分组，向导与参数模式共用这些执行逻辑。原有 `writing`、`plan`、`snapshot`、`site`、`git`、`deploy` 服务保留校验、锁和不可变快照契约。

终端问答和构建诊断走 stderr，结果走 stdout；`--json` 禁用问答并保留机器可读结果与退出码。命令不执行 shell 字符串，Git 环境清理和隔离构建的环境变量清理保持有效。
