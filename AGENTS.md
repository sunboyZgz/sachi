# Sachi Blog — Codex 项目说明

## 目录职责

- 根目录是正式博客项目：Next.js App Router、React 和 TypeScript 源码都在这里。
- `mutouren-ui-kit/` 是只读的视觉交接包和迁移基线。不要在其中开发、安装依赖或生成构建产物。
- 开始视觉或交互修改前，先读 `mutouren-ui-kit/AGENTS.md`，并遵循它指向的设计决定、页面规范、素材说明与验收基线。

## 实现边界

准确保留站名、签名、简介、栏目名称和“蘸豆！！”的两个感叹号。首页是封面，目录是三栏结构；不擅自添加常驻导航、后台、在线编辑器、深色模式、无限滚动或自动翻页。

新文章来自根目录 `content/<栏目>/<创建日期[-序号]>/index.md`，兼容原 `content/*.md` 样例。CLI 和前端共用内容适配与 AST/GFM 流水线；Pretext 只负责带 `flow` 配置文章的局部纯文本环绕，继续使用 frontmatter.flow，不增加 layout.yaml。移动端、打印或引擎异常时必须保留完整正文并降级为普通 DOM 排版。

系列资料来自 `content/series/<UUID>.yaml`，文章通过可选 `series: { id, order }` 归组。发布章节时自动冻结所属系列最新资料，未选文章和无关系列保留公开快照。公开系列页面和导航只从发布集合生成；旧文章不填默认 series，不改写旧快照哈希。

CLI 位于 `tools/blog-cli/`，入口是 `npm run blog -- <命令>`。`.blog/` 仅是缓存，`.blog-store/` 是持久快照、冻结代码、计划和发布记录，不要把两者混淆。没有 Git 仓库或 Git 配置时不自动初始化根仓库、不提交或推送，不阻塞本地写作和隔离构建。正式构建只使用发布清单，不能读取当前草稿或其他文章的未发布修订。测试使用临时内容仓库和本地部署器，不连接真实 GitHub/服务器。

头像源文件只放在 `src/assets/avatar/`，固定命名为 `avatar-head.png` 和 `avatar-half.png`，并通过静态导入引用以获得内容哈希。首页和目录使用头部头像，文章正文结束后的署名使用半身图；文章首屏、栏目分页页和其他共享页头不增加头像。更换头像时覆盖同名文件，不在页面或 Markdown 中复制资源。

## 运行与验证

- `npm run dev`：在 `127.0.0.1:4173` 启动日常写作预览，只显示根目录真实工作内容；无文章时显示空栏目。
- `npm run dev:fixtures`：在 `127.0.0.1:4176` 显式预览 `tests/fixtures/content/` 的排版测试数据，使用独立 Next 缓存。
- `npm run check`：依次运行 ESLint、TypeScript 和 Vitest。
- `npm run build`：从当前发布快照生产静态导出，无发布记录时为空站；排除 fixture 和未发布修订。
- `npm run build:fixtures`：带排版样例生成静态导出，用于视觉验收。
- `npm run test:browser`：在独立 fixture 服务上运行 Playwright 交互和响应式回归，不复用日常写作预览。

根项目的构建产物是 `out/`。不要改写 `mutouren-ui-kit/dist/` 或它的截图来掩盖视觉差异。

CLI 手册网站独立放在 `docs-site/`，使用 VitePress，依赖通过 `npm run docs:install` 单独安装。`npm run docs:dev` 监听 127.0.0.1:4174；`npm run docs:build` 输出 `docs-site/.vitepress/dist/`，不写博客 `out/`。CLI 命令定义修改后运行 `npm run docs:generate` 同步参考，`npm run docs:check` 校验章节、链接、参数同步和文档主题类型。不将博客草稿、快照或头像复制进文档站。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
