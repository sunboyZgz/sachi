---
title: 项目目录职责
scope: reference
---

# 项目目录职责

主动留存的稿件历史在 `.blog-store/drafts/versions/<文章ID>/<稿件ID>/`：每稿独立全量保存原文、素材和预设，`draft.json` 记录时间、备注与文件清单，可以直接打开或独立备份。旧 `records/objects` 格式仍可读取并转换。回档前的实际文件另存在 `.blog-store/writing-transactions/`，CLI 支持撤销回档。它们是私有持久资料，不是 `.blog/` 缓存，不进入公开集合；使用方式见[稿件留存与回档](/writing/drafts)。

正式项目直接位于 `sachi/` 根目录，不在视觉交接包中开发。无需把内容、头像或使用手册复制到另一个项目。

```text
sachi/
├─ blog.config.json           # CLI、时区、正式域名、可选 Git/部署/Pages 配置
├─ .sachi/yandu-upload.json  # 本地私密上传凭证；Git 忽略，不进入冻结或备份
├─ src/
│  ├─ app/                    # Next 路由、页面、robots、sitemap
│  ├─ components/             # 阅读界面、Markdown、Pretext 环绕、署名
│  ├─ config/
│  │  ├─ profile.json         # 唯一的公开个人信息配置
│  │  ├─ profile-schema.ts    # 前端与 CLI 共用的配置校验契约
│  │  ├─ profile.ts           # 读取配置、题字素材与文字的对应关系
│  │  └─ site.ts              # 栏目、分页与资源路径规则
│  ├─ assets/avatar/          # 固定名头像，静态导入产生内容哈希
│  ├─ lib/
│  │  ├─ blog/                # 文章契约、扫描、媒体/轮廓、冻结数据适配
│  │  ├─ markdown.ts         # 正式 AST/GFM 解析与环绕区域提取
│  │  ├─ flow-geometry.ts    # 通用环绕几何和轮廓校验
│  │  └─ seo.ts              # canonical、分享信息、JSON-LD、索引策略
│  └─ styles/                # 设计变量与页面排版
├─ .blog-store/content/
│  ├─ 闲暇娱乐/<日期[-序号]>/index.md
│  ├─ 生活旁白/<日期[-序号]>/index.md
│  ├─ 蘸豆！！/<日期[-序号]>/index.md
│  │                           # 每篇的 assets/ 和可选 media.yaml 在同级
│  └─ *.md                    # 兼容的旧格式真实文章
├─ .blog-store/content/series/<UUID>.yaml # 独立系列名称、简介与所属栏目
├─ .blog-store/content/toys/<UUID>/toy.yaml # 本地待处理作品资料；原媒体只保存引用，不进入舞台
├─ templates/                # 新文章的可选模板
├─ public/
│  ├─ assets/                 # 共用题字、桌面插画、栏目图，不放头像
│  └─ media/                  # 开发时派生的哈希媒体，不是写作源文件
├─ bin/blog.mjs              # 可选的本机 blog 命令入口
├─ tools/blog-cli/           # 写作、快照、媒体、构建、发布、Pages 推送与恢复
├─ tools/docs/               # 手册参数生成与链接检查
├─ tests/                    # 浏览器交互和响应式回归
│  └─ fixtures/content/      # 排版测试正文，日常写作预览不加载
├─ docs/                     # 简短项目/CLI 总览
├─ docs-site/                # 独立 VitePress 手册源文件与独立依赖
├─ .blog/                    # 可重建缓存、日志、临时隔离构建、旧 out 备份
├─ .blog-store/              # 私有资料仓库：原稿、稿件历史与发布持久数据
├─ .blog-archive/            # 历史验收资料与迁移校验记录，两个仓库都忽略
└─ out/                     # 博客静态导出：生产仅含明确发布内容
```

## 改什么，去哪里

| 目的 | 唯一入口 |
| --- | --- |
| 改名字、签名、简介、版权和作者资料 | `src/config/profile.json` |
| 改正式域名、时区、Git 或服务器 | `blog.config.json` |
| 配置 Yandu 本地凭证 | `blog.config.json.yandu.credentialFile` 指向私密 JSON，默认 `.sachi/yandu-upload.json`；仅文件不存在时读环境变量 |
| 换头像 | `storage avatar head/half --file` 保存 Yandu 版本并关联个人资料，保留原固定文件 |
| 写文章、换本篇封面或环绕图 | 本篇 `index.md` 和 `assets/` |
| 准备作品资料、查询 ID | `blog toy`；登记在 `.blog-store/content/toys/<UUID>/toy.yaml` |
| 设置环绕尺寸、位置、替代文字 | 本篇 frontmatter 的 `flow` |
| 指定手工轮廓 | 本篇 `flow.contour`；省略时自动生成，不使用 `layout.yaml` |
| 看操作手册或补充手册 | `docs-site/`，不是博客文章目录 |
| 交付给静态服务器 | `out/`；手册另交付 `docs-site/.vitepress/dist/` |

## 源文件、派生文件和持久数据

`.blog-store/content/`、头像、个人配置和文档是源文件，不能用构建输出覆盖。`public/media/` 的预览派生文件、`.next/`、文档站输出与 `out/` 不是编辑入口。

`.blog-store/` **不是缓存**。其中不可变快照与发布包用于继续计划、恢复和回滚，不要作为清理临时文件的目标。`.blog/` 虽主要是缓存，但 `export-backups/` 保留旧导出，也可能是你唯一想恢复的旧文件，不应无差别删除。

如果另行附带 `mutouren-ui-kit/`，它只是只读视觉基线，不安装依赖、不写代码、不生成新的 dist 或截图。

## 发布边界

修改源文件只影响本地工作区；正式构建从冻结代码和候选发布清单读数据，不扫描未选草稿，不复制 `.sachi/` 或根目录 `.env`，也不复制整个 `public/media/`。未配置 Git 时不提交，不创建根 Git 仓库。

`.blog-store/content/toys/` 当前是 CLI 的本地待媒体处理资料，不参与舞台读取或发布清单。原封面与视频路径及摘要保存在登记文件中；CLI 不复制原件，不把原视频大小当成压缩后结果。见[作品录入](/writing/toys)和[Yandu 后续验收目标](/reference/yandu-acceptance)。

部署只公开静态导出目录，不公开源码、配置、手册源文件、`.blog/` 或 `.blog-store/`。独立手册不能索引私有文章和快照。

GitHub Pages 是例外的**公开发布源码分支**：`blog` 分支含冻结 Next 源码、`.blog-input/` 的明确公开内容、预处理媒体、校验清单和 `.github/workflows/blog-pages.yml`；Actions 仅将 `out/` 作为网站产物部署。它不含工作草稿、文档站或整个持久存储，`main` 不被发布命令改变。Pages 回执保存在 `.blog-store/pages/`，临时 Git 提交目录在 `.blog/pages-worktrees/`。根 `.gitignore` 排除新文章目录和环境文件；已跟踪文件及历史仍须自行审查。[分支与 Pages 接入](/setup/github-pages)。

## 私有备份

`.blog-store/.git` 属于独立私有资料仓库，外层根 Git 忽略整个 `.blog-store/`，不登记为 submodule。逻辑 `content/...` 仍保存在历史记录中，当前物理原稿位于 `.blog-store/content/`；原稿移动不改写稿件 ID、快照哈希或旧恢复记录。详见[私有资料仓库](/backup/store)。

## 相关操作

[配置个人信息](/setup/profile) · [SEO 检查](/setup/seo) · [文章契约](/reference/content) · [环绕写法](/writing/flow) · [手册维护](/reference/docs-site)
