---
title: 维护和部署文档站
scope: reference
files: 文档源码与独立静态产物
network: 安装依赖、选择上线时需要
online: 本地构建不改变任何网站
---

# 维护和部署文档站

## 安装与启动

在 sachi 根目录运行：

```sh
npm run docs:install
npm run docs:dev
```

手册默认在 http://127.0.0.1:4174，博客仍使用 4173。文档依赖由 docs-site/package-lock.json 独立锁定，不执行 Next.js 构建；部分教学预览按需复用根项目的 React 阅读组件，因此先安装根项目依赖。不会读取博客草稿、快照或个人资料。

## 修改一项操作

1. 找到 docs-site 中对应的任务页，按“准备、步骤、结果、影响、错误、参数”更新。
2. 在 .vitepress/navigation.ts 调整目录。不要将博客 content、私有快照或视觉交接文件作为文档内容。
3. 命令参数改动后重新生成参考页：运行 `npm run docs:generate`；生成页的数据来自实际 Commander 定义。
4. 运行 docs:check，检查目录、链接、任务章节和参数同步。
5. 构建后验证中文搜索、键盘操作、窄屏目录与代码复制。

### 怎样判断一页说明足够详细

章节存在只是自动检查的最低标准，写完还应按新用户视角确认：

1. 开始前写清依赖、当前目录、配置条件以及是否需要已有成功版本。
2. 菜单入口写到具体选项；多选、默认取消、保留 / 停用配置都有说明。
3. 给出可跟随的示例，占位符说明怎么替换，输出字段说明去哪看。
4. 成功标准区分“保存、检查、构建、推送、实际部署”，不以退出码 0 统一代表上线。
5. 对草稿、未选修订、原素材、全站基线与远端明确说明影响范围。
6. 失败后的下一步匹配当前实现，特别区分服务器 / Pages / 双目标，不用删除持久数据或强推来绕过保护。
7. 自定义块给同源的源码和生成效果，并说明不支持的结构与降级。

修改行为说明时核对 `tools/blog-cli/commands/`、`wizard.ts`、共享内容契约与实际测试；参考页的叙述数据在 `tools/docs/reference.ts`，不要手改生成文件。当前没有实现的功能明确标记“暂不支持”，不能把设想写成使用步骤。

## 自定义 Markdown 必须附示例和效果

涉及自定义资源、flow 或阅读增强时，按“完整源码 → 生成效果 → 观察点 → 限制／降级”说明，不只给一个字段或命令。参考[环绕示例](/writing/flow)、[视频示例](/writing/video)和[正文块示例](/reference/content)。

示例 Markdown 的唯一来源在 `.vitepress/examples/`。任务页通过 VitePress 的源码片段导入显示可复制代码，再使用 BlogExample 展示同一份内容。`.vitepress/ExampleReading.ts` 复用博客 AST/GFM、MarkdownContent、CodeBlock 和 FlowParagraphs；预览使用隔离阅读框，避免标题 ID 和样式污染手册。封面只展示栏目重点条目的示意，必须标明“示意”。

图片、视频和附件都是独立教学素材，源图为本目录中的 SVG，不复制真实文章、头像或发布包。运行 `npm run docs:examples` 可重新生成 `docs-site/public/examples/`；docs:dev 和 docs:build 自动执行它。已有教学视频可以直接使用，仅在视频文件缺失、需重新生成时要求 FFmpeg。

增加示例时同步 `tools/docs/examples.ts` 的定义，添加对应源码、效果组件与说明；docs:check 会拒绝缺少源码／预览、未知示例 ID、素材链接失效等情况。普通只读检查不会修改教学素材。

## 生成静态网站

```sh
npm run docs:build
npm run docs:preview
```

产物只有 docs-site/.vitepress/dist。默认 .html URL 不要求服务器做 SPA 兜底；部署只上传此目录，不上传整个项目、node_modules 或 .blog-store。

修改文档时优先使用 `docs:dev` 的实时更新。若重新运行 `docs:build`，先用 Ctrl+C 停止旧的 `docs:preview`，构建完成后重新启动，再刷新浏览器；不要让旧页面继续请求已被新构建替换的资源。

## 放在子路径

文档网站从 `docs-site/docs.config.json` 读取配置，两个字段都必填：`schemaVersion` 为数字 `1`，`base` 为公开 URL 的路径部分。站点根目录用 `/`，部署到 `/handbook/` 时改为：

```json
{
  "schemaVersion": 1,
  "base": "/handbook/"
}
```

路径必须以 `/` 开始和结束，各段只用字母、数字、下划线或短横线；不填写域名、磁盘目录或博客 `siteUrl`。保存后照常运行 `npm run docs:build`、`npm run docs:preview`，访问 `http://127.0.0.1:4174/handbook/`；开发服务改配置后也需重启。

只有该 JSON 文件不存在时才使用 `DOCS_BASE` 环境变量，变量也未设置则默认 `/`。文件存在但无效或缺字段会报错，不用环境变量补齐。仓库自带根路径配置，因此普通使用不需要设置环境变量。域名、托管服务和生产发布由使用者决定，本步骤不会连接生产服务器。

## Yandu 文档和可运行示例

[参数表](/reference/yandu-config)对应实际配置契约，[凭证教程](/setup/yandu-credentials)对应管理页权限与两端私密配置，[SDK 页](/reference/yandu-sdk)导入 `tools/examples/yandu-sdk-readonly.ts` 的真实源码，避免展示一份、运行另一份。修改 SDK 示例后使用固定包做类型检查及临时 HTTP 模拟验证，不拿真实凭证当测试数据。

Yandu MIT 原文按固定来源提交保存在 `vendor/YANDU-LICENSE.txt`，手册的 `public/licenses/yandu-MIT.txt` 是同一文本的下载副本。变更来源版本时核对并同步两份，保留原版权；不改写归档以冒充原有 SHA256。具体软件许可范围见 SDK 页，不将 SDK 许可套用到文章和媒体。

## 本地搜索与隐私

本地搜索只索引手册页面，中文使用词边界切分；不需要 Algolia 账号，不读取草稿、SSH 信息或浏览器账户。字体使用系统字体，不请求外部字体或分析服务。
