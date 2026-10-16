# 请叫我木头人

一个位于 `sachi/` 根目录、使用 Next.js App Router、React 19 和 TypeScript 的静态个人博客。实现严格迁移自 `mutouren-ui-kit/` 视觉交接包：封面、三栏目录、栏目分页、文章目录，以及由真实 Pretext 驱动的局部图文环绕均已保留。

`mutouren-ui-kit/` 只作为原始视觉基线和实现说明保留，不是这个项目的源码目录，也不参与根项目构建。

## 本地运行

需要 Node.js 20.9 或以上。

```sh
npm ci
npm run dev
```

开发服务器固定监听 `http://127.0.0.1:4173`，只读取根目录 `content/` 的真实工作内容。没有文章时，目录和栏目显示空状态。20 篇旧排版样例已移到 `tests/fixtures/content/`，不再混入日常预览或 CLI 文章列表。

```sh
npm run check          # ESLint + TypeScript + Vitest
npm run dev:fixtures   # 4176 上单独预览排版测试内容
npm run test:browser   # Playwright 交互与响应式回归
npm run test:cli:next  # 临时项目中的真实 Next.js 发布隔离验证
npm run build          # 从当前发布快照静态导出；无记录时为空站
npm run build:fixtures # 带样例生成静态导出，用于视觉验收
npm run preview        # 预览 out/，仅监听 127.0.0.1:4173
```

调试特殊块 UI 时，运行 `npm run dev:fixtures`，打开 [特殊块排版样例](http://127.0.0.1:4176/article/special-blocks/)；fixture 首页也提供直接入口。样例集中展示公式、11 种代码高亮、长代码、宽表格、引用、列表和脚注，使用博客实际渲染器。测试正文与样式入口见 [排版测试说明](tests/fixtures/README.md)。

`npm run build` 的产物在 `out/`，可直接交给 Nginx、Caddy 或任意静态文件服务器。站点采用目录式 URL 和尾斜杠，例如 `/article/learning-rhythm/`。

## VS Code 文章预览

插件在编辑器右侧实时展示文章内容区，包含博客原有排版、图文环绕、媒体和末尾署名；未保存的修改也会刷新。

```sh
npm run preview:build
npm run preview:package
```

在 VS Code 中通过“从 VSIX 安装”选择 `tools/vscode-preview/dist/sachi-blog-preview.vsix`，打开博客文章后运行 **Sachi Blog: 打开文章预览**（macOS `⌘⌥V`）。完整方案、支持范围与验证见 [插件说明](tools/vscode-preview/README.md)。

## 更换头像

头像源文件单独放在 `src/assets/avatar/`，文件名固定：

- `avatar-head.png`：首页简介和目录右上角使用的头部头像。
- `avatar-half.png`：文章正文末尾作者署名使用的半身场景图。

更换时直接用新的透明 PNG 覆盖对应同名文件，然后重新运行开发服务器或执行 `npm run build`。代码通过静态导入使用头像；文件内容变化后，Next.js 会生成新的带哈希资源地址，因此部署新构建时不会继续命中旧头像缓存。不要改变文件名，也不要把头像复制到各个页面或 Markdown 中。

## 个人配置与 SEO

公开个人信息唯一入口是 [src/config/profile.json](src/config/profile.json)：站名/作者名、签名、简介、首页小标、版权起始年份、公开作者主页、全站 SEO 摘要和索引开关。首页、页头、文章署名、版权和 SEO 共用它。默认题字图保持不变；改名或改签名后自动显示真实文字，避免旧 SVG 与新资料不一致。部署凭据不要写进公开资料。

正式域名只在 `blog.config.json` 的 `siteUrl` 配置，保留 `null` 就不伪造域名。正式发布生成 canonical、Open Graph/Twitter 分享信息、文章 JSON-LD、`sitemap.xml` 和 `robots.txt`；开发/fixture 预览、未配置域名、空栏目及 404 不收录。SEO 发布时间和更新时间来自实际发布清单。修改配置属于全站基线，需要明确接受后重新构建发布。

详见[个人配置](docs-site/setup/profile.md)、[SEO 验收](docs-site/setup/seo.md)和[项目目录职责](docs-site/reference/project-structure.md)。

「关于我」页面位于 `/about/`，从首页头像和文章末尾署名区进入。竹景与书茶素材来自 `bamboo-about-ui` 交接包，样式仅作用于个人页；首页封面和目录保持原构图。扩展介绍、兴趣、近况和公开链接集中维护在 `src/config/profile.json` 的 `about` 字段中，默认留空，未填写的区域不显示；填写真实资料后自动展示。

手动维护的字段为 `bio`（简短简介）、`about.introduction`（多段详细介绍）、`about.interests`（兴趣）、`about.updates`（带日期的近况）和 `about.links`（公开链接）。文章篇数、发文天数、热点图及日期文章列表自动从发布记录生成，不写入个人配置。完整字段和自动统计规则见[配置个人信息](docs-site/setup/profile.md)。

写作日历按博客时区统计当前公开文章的首次发布日期，桌面显示全年，手机显示月历，支持选择日期查看真实文章。日常预览只读取 `.blog-store/current.json` 中的公开清单，没有发布记录时为零，不计入工作区草稿；正式构建只读取冻结发布清单。fixture 预览使用独立测试文章，并明确标注为排版示例。页面支持无 JavaScript 和打印时的完整日期文章列表，不使用交接包的演示发文记录或演示 RSS。

## 目录职责

| 目录/文件 | 职责 |
| --- | --- |
| `src/app/`、`src/components/`、`src/lib/`、`src/styles/` | 路由、界面、内容/SEO/环绕逻辑、样式 |
| `src/config/profile.json` | 公开个人资料；栏目契约仍在 `site.ts` |
| `src/assets/avatar/` | 固定文件名头像，不放在 public 或文章中 |
| `content/<栏目>/<日期[-序号]>/` | 真实工作文章：每篇 index.md、本篇 assets、可选 media.yaml |
| `tests/fixtures/content/` | 显式排版验收与浏览器回归使用的测试正文 |
| `public/assets/`、`public/media/` | 共享视觉素材、开发预览的派生哈希资源 |
| `tools/blog-cli/`、`bin/`、`templates/` | CLI 实现、命令入口、可选文章模板 |
| `docs-site/`、`tools/docs/` | 独立手册、参数生成与校验 |
| `.blog/` | 缓存与临时构建；其中 export-backups 保留旧导出 |
| `.blog-store/` | 持久不可变快照、计划、发布包与回执，**不是缓存** |
| `out/` | 博客静态导出；只部署它，不公开源码/私有快照 |

## 内容写作

原生系列支持独立资料、章节顺序、系列目录和前后篇导航。运行 `npm run blog -- series new` 创建系列，新建文章时选择系列；发布章节会同步更新所属系列介绍，其他系列保留旧快照。详见[系列文章操作](docs-site/writing/series.md)。

运行 `npm run blog` 可进入分步菜单，完成新建、文章信息修改、检查、构建、发布、回滚和恢复，无需记参数。执行一次 `npm link` 注册本机命令后，直接运行 `blog` 也会打开同一菜单；不想改变全局环境可继续使用 npm 入口。常用顺序为新建 → 预览 → 检查 → 发布，再到信息修改、状态、构建和备份等操作。

`npm run blog -- new` 也可直接选择三个固定栏目之一，再输入标题，生成 `content/<栏目>/<日期[-序号]>/index.md` 和独立 assets 目录。参数与 `--json` 模式保留供脚本使用。发布不默认勾选任何文章，执行确认默认取消；根项目没有 Git 仓库也能使用，Git/服务器配置后才启用同步和发布。详细操作教程见下方独立手册网站；原 [Blog CLI 使用说明](docs/BLOG-CLI.md) 保留作为总览。

## CLI 使用手册网站

基于 VitePress 1.6.4 的独立静态文档站位于 `docs-site/`，与博客构建、内容和资源隔离。62 页按任务组织，每项操作包含前置条件、菜单入口、逐步输入、结果验证、影响范围、常见问题和参数示例；支持中文本地搜索。博客站点本身不增加搜索或导航。

```sh
npm run docs:install   # 文档站依赖单独安装，根 npm ci 不包含它
npm run docs:dev       # http://127.0.0.1:4174
npm run docs:generate  # CLI 参数变化时，重新生成 19 条命令参考
npm run docs:check     # 页面章节、链接、参数同步和 Vue/TS 检查
npm run docs:build     # 输出 docs-site/.vitepress/dist/
npm run docs:preview   # 在 4174 预览生成后的静态站
```

如部署到子路径，构建时设置 `DOCS_BASE=/handbook/ npm run docs:build`。只部署 `.vitepress/dist/`，不要公开 `content/`、`.blog-store/` 或整个项目目录。维护与部署步骤见 [手册站说明](docs-site/reference/docs-site.md)。

## main / blog 与 GitHub Pages

`main` 继续管理开发代码；`blog` 由 CLI 在隔离目录中生成，只包含冻结的发布源码、明确选中的公开正文和媒体，以及构建/部署 Pages 的 GitHub Actions。不会自动初始化、提交或推送根项目 main。工作草稿和环境文件默认忽略，公开 main 前仍需审查已跟踪文件与历史。

```sh
npm run blog -- init --pages --yes       # 默认读取根仓库 origin 推送地址
npm run blog -- build <文章> --yes      # 明确选择，生成冻结发布包
npm run blog -- push <release-id> --dry-run
npm run blog -- push <release-id> --setup-pages --yes
npm run blog -- status --remote
```

也可在向导中配置 Pages 地址，或用 `push --pages-remote <GitHub仓库地址>` 仅覆盖本次。`publish` 与 `push` 会执行已配置的服务器和 Pages 两个钩子，未配置目标跳过；每个结果分别记录。Pages 推送成功只表示 Actions 排队，读取站点版本标记后才核实上线；失败后用同一 release-id 重试，不混入当前新草稿。

普通仓库使用 `https://OWNER.github.io/REPO/`，`OWNER.github.io` 同名仓库使用根 URL。已适配文章链接、媒体、头像、环绕与 SEO 的仓库子路径。免费方案需公开仓库，首次设置需 `gh auth login` 和仓库管理权限。完整步骤见[GitHub Pages 手册](docs-site/setup/github-pages.md)；当前自动回滚/服务器恢复仅适用于服务器部署，不会静默只回滚双目标中的一端。

原 `content/*.md` 格式继续兼容。元数据由 Zod 验证：

```yaml
---
title: 文章标题
date: 2026-09-29
category: learn # play / life / learn
featured: false
fixture: false
tags: [Markdown]
minutes: 5
---
```

- `play` 文章可包含 `status`（默认“记录”），并可包含技术标签。
- `life` 文章只需要日期与分类。
- `learn` 文章可覆盖自动计算的 `minutes`，并可包含标签。
- `fixture: true` 的文章不会显示在日常开发预览中；`dev:fixtures` 和 `build:fixtures` 显式读取独立测试目录，不混入真实工作草稿。
- 每个栏目应准备 1 篇 `featured: true` 的文章和至少 2 篇普通文章，才能呈现已确认的目录构图；没有公开内容时页面显示明确空状态。

普通正文由 Markdown AST 和 GFM 流水线渲染，不允许原始 HTML。需要局部图文环绕的文章在 frontmatter 中增加：

```yaml
flow:
  image: ./assets/tea-cup.webp
  width: 205 # 可选；横竖图按原始比例，最高 360 px
  # contour: ./assets/tea-cup-contour.json # 可选手工轮廓；省略则按 alpha 自动生成
  defaultX: 0.53
  defaultY: 86
```

启用后，首个二级标题之前必须只有纯文本段落和一张独立静态图片。可配置图片最大宽度、位置与 alt；省略 contour 时由 Sharp 从透明通道生成哈希轮廓，不透明图按矩形处理，原图不裁边、不改写。构建期会把这些块交给 `FlowParagraphs`；Pretext 仅在需要桌面环绕时加载并计算换行与行段，文本仍以可访问的 DOM 输出。链接、强调、代码、表格等继续由普通 Markdown 渲染。窄屏、打印、无 JavaScript、图片/轮廓或引擎失败时自动退回完整普通 DOM 排版。
### 具体写法

下面为正文示意；完整 frontmatter 的 ID、标题与创建时间由 `blog new` 生成。

```markdown
---
flow:
  image: ./assets/tea-cup.webp
  contour: ./assets/tea-cup-contour.json
  defaultX: 0.53
  defaultY: 86
---

第一段纯文本。

第二段纯文本。

![图片说明](./assets/tea-cup.webp)

## 接下来的正文
```

## 项目边界

目前已完成框架与 TypeScript 等价迁移，以及本地写作、媒体处理、隔离构建、显式发布与恢复 CLI。不包含搜索、RSS、评论、网页后台、在线编辑器或动态 API；不会将普通 Git 提交自动变成线上发布。头像已经接入固定资源目录；两幅题字 SVG 和其他现有插画仍是视觉试样，字体授权、最终题签、项目截图与生活照片仍需另行落实。迁移前的 `preview.html`、`dist/` 和 `previews/` 位于 `mutouren-ui-kit/`，只作为视觉基线，不是新构建入口。
