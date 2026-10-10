# Sachi Blog 文章预览

在 VS Code 中打开 Sachi Blog 的 Markdown，右侧直接显示博客的文章内容区：栏目、标题、日期/标签、正文和半身头像署名。编辑器中的修改无需保存，默认停止输入 180 ms 后刷新；保存、撤销/重做、外部修改和本篇资源变化也会刷新。

## 安装与使用

在博客根目录执行：

```sh
npm ci
npm run preview:build
npm run preview:package
```

生成 `tools/vscode-preview/dist/sachi-blog-preview.vsix`。在 VS Code 扩展页面的 `…` 菜单选择 **从 VSIX 安装**，选中该文件。需要 VS Code 1.96 或以上，以及受信任的本地或 Remote SSH 工作区。构建沿用博客的 Node.js 20.9 要求；打包工具 VSCE 4 需要 Node.js 22，首次打包会下载固定版本工具，安装现成 VSIX 时无需 Node.js。

1. 在 VS Code 中打开博客项目文件夹。
2. 打开 `content/<栏目>/<日期[-序号]>/index.md`。
3. 点击编辑器右上角的预览图标，或命令面板运行 **Sachi Blog: 打开文章预览**。快捷键：macOS `⌘⌥V`，Windows/Linux `Ctrl+Alt+V`。
4. 继续输入即可实时预览。命令 **Sachi Blog: 刷新文章预览** 可手动刷新。

兼容旧 `content/*.md`；`tests/fixtures/content/` 只在明确打开其中的文件时预览。普通 README、文档站 Markdown 和其他仓库不会替代当前文章。

默认跟随当前文章编辑器。设置 `sachiPreview.followActiveEditor` 为 `false` 可固定当前文章；再次执行打开预览命令可切换。`sachiPreview.debounceMs` 可调整刷新等待时间。刷新通过消息更新 React 内容，保留同一篇文章的阅读位置，不重新加载整个 Webview。

## 支持的博客内容

| 内容 | 预览行为 |
| --- | --- |
| frontmatter | 复用博客元数据适配：目录栏目、标题、日期、tags、status、minutes |
| GFM | 标题链接、强调、列表、引用、表格、任务列表、代码复制 |
| 本篇图片 | 标准 Markdown 图片语法，显示图片说明；引用式图片也支持 |
| 视频 | 同样的图片语法自动识别 mp4/webm/mov/m4v，原生播放器；支持 media.yaml 的 poster |
| 附件 | 本篇 assets 中的附件链接，点击通过 VS Code 打开 |
| 文章/系列链接 | `blog:<UUID>`、`/article/<slug>/`、`series:<UUID>`、`/series/<slug>/`；点击打开当前内容仓库的源文件 |
| 图文环绕 | 仍使用 frontmatter.flow；透明图片自动生成轮廓，也支持手工 contour，使用真实 Pretext 互动组件 |
| 末尾署名 | 读取项目 profile.json 和 src/assets/avatar/avatar-half.png |

不引入新的 Markdown 块语法。手册站的 `::: tip` 不属于博客语法。`cover` 是列表封面，文章内容区不额外插入封面；系列目录/前后篇导航属于站点阅读导航，此预览聚焦当前正文。视频仍受 VS Code 内置浏览器的编码支持限制。

正文宽度小于 520 px 或窗口不超过 600 px 时，环绕显示完整普通排版。环绕配置暂时不完整、图片/轮廓/引擎出错时同样保留完整正文并显示提示。YAML 或其他元数据无效时，显示错误并保留上一次有效预览；修正后自动恢复。

图片、视频和附件示例：

```markdown
![图片说明](./assets/photo.png)
![视频说明](./assets/demo.mp4)
[下载附件](./assets/notes.pdf)
```

## 实现方案

- **Extension Host**：监听 TextDocument 的内存内容，使用共享 `src/lib/blog/document.ts` 与 schema 做元数据适配，映射文章资源为 `asWebviewUri`，发送版本化消息。连续修改后只接受最新版本。
- **Webview**：直接使用博客的 `ArticleIntro`、`ArticleProse`、`MarkdownContent`、`FlowParagraphs` 和 `AuthorSignatureView`，读取根项目的 tokens.css/site.css。预览字体、颜色、正文尺寸和栏目差异与博客使用同一实现。
- **自动轮廓**：Webview 用 Canvas 采样，发布端继续使用 Sharp；共用 alpha 边界算法，最高 256 px 采样，不把 Sharp 原生模块装进插件。两种图像缩放器在边缘采样上可能有细微差异，最终发布验收仍以博客构建为准。
- **隔离**：不启动 Next.js、不执行工作区脚本、不写回文章，不读取 .blog-store，不构建或发布。图片与附件限定本篇 assets（旧文使用 public/assets），拒绝越界和符号链接；Webview 有 CSP，关闭时清理监听与任务。
- **打包**：esbuild 把共享组件和依赖打包到 VSIX；项目 CSS、个人资料和头像会实时读取。共享 TypeScript 渲染组件或插件源码变化后重新构建并安装 VSIX。

## 验证与开发

```sh
npm run check
npm run preview:build
npm run preview:test:host
npm run test:browser
npm run preview:package
```

`preview:test:host` 在临时内容仓库和独立 VS Code 用户目录中运行真实 Extension Host/Webview 测试，检查未保存正文、错误恢复、自动轮廓、资源刷新、快速输入、切换文章和关闭清理。不访问实际 GitHub 或服务器。默认使用 macOS 的 `/Applications/Visual Studio Code.app/Contents/MacOS/Code`，其他安装位置通过 `VSCODE_EXECUTABLE` 指定桌面可执行文件。

Webview 与资源访问参考 [VS Code 官方 Webview API](https://code.visualstudio.com/api/extension-guides/webview)；安装包参考 [官方扩展打包文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions)。本插件使用本地标识 `sachi-local.sachi-blog-preview`，无需发布到 Marketplace。
