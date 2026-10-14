# Sachi Blog 文章预览

在 VS Code 中打开 Sachi Blog 的 Markdown，右侧直接显示博客的文章内容区：栏目、标题、日期/标签、正文和半身头像署名。编辑器中的修改无需保存，默认停止输入 180 ms 后刷新；保存、撤销/重做、外部修改和本篇资源变化也会刷新。

## 安装与使用

在博客根目录执行：

```sh
npm ci
npm run preview:build
npm run preview:package
```

生成 `tools/vscode-preview/dist/sachi-blog-preview.vsix`。在 VS Code 扩展页面的 `…` 菜单选择 **从 VSIX 安装**，选中该文件。需要 VS Code 1.96 或以上，以及受信任的本地文件或 Remote SSH 工作区。单独打开本地文件也可使用，无需打开整个项目。构建沿用博客的 Node.js 20.9 要求；打包工具 VSCE 4 需要 Node.js 22，首次打包会下载固定版本工具，安装现成 VSIX 时无需 Node.js。

1. 在 VS Code 中打开博客项目文件夹，或直接打开一份文章文件。
2. 打开 `content/<栏目>/<日期[-序号]>/index.md`、完整稿件中的原文、导出的旧稿，或任意位置符合博客元数据格式的 `.md`。
3. 点击编辑器右上角的预览图标，或命令面板运行 **Sachi Blog: 打开文章预览**。快捷键：macOS `⌘⌥V`，Windows/Linux `Ctrl+Alt+V`。
4. 继续输入即可实时预览。命令 **Sachi Blog: 刷新文章预览** 可手动刷新。

兼容旧 `content/*.md`；`tests/fixtures/content/` 只在明确打开其中的文件时预览。普通 README 和只有教程元数据的 Markdown 不会替代当前文章。其他仓库中符合博客文章格式的文件也可预览。

## 诗歌模式

在原有 frontmatter 增加 `type: poem`，或在 Blog CLI 新建／修改元数据菜单中选择“诗歌 Markdown”。标题与诗行自动居中，正文顶层段落的一次回车就是诗行换行，空行分诗节，不需要逐行写 `\` 或居中标记。未保存的类型切换也会立即更新；`type: article` 或省略 type 使用普通 Markdown。

强调、链接仍可使用；代码、公式、列表、引用、表格与图片保持各自规则。长诗行在窄面板自然折行，诗句与字符实体仍支持逐行跟随和精确点击定位。诗歌暂不支持 flow：未完成的冲突配置会提示原因并保留完整诗歌与普通图片，CLI 检查会要求修正。写法与真实教学效果见[诗歌教程](../../docs-site/writing/poetry.md)。

## 行内字号

正文中用 `++文字++` 放大到周围字号的 1.2 倍，`--文字--` 缩小到 0.85 倍。结束标记后加 `{n}` 可指定倍数：`++文字++{2}` 为 2 倍，`--文字--{2}` 为 1/2；n 支持有限正数和小数。标记在同一源文件行内配对，字号修改即时刷新，与加粗、斜体、链接及诗歌模式兼容，点击文字仍精确定位原源码。

代码、公式、链接地址及 C++ 保持原样；未配对标记和无效倍数保留原文。带字号的段落采用普通富文本排版，作为 flow 环绕边界。写法和实际效果见[字号教程](../../docs-site/writing/text-size.md)。

## 任意目录中的文章与旧稿

完整稿件或导出目录保留原栏目路径时，不需要修改文章：直接打开其中的 `content/<栏目>/<日期>/index.md` 即可。插件使用这份文章自己的 `assets/` 与 `media.yaml`；旧式导出稿使用该导出目录的 `public/assets/`，不会借用当前工作文章的同名图片。

例如将一篇文章单独放在 `~/writing/随笔.md`，无法从路径识别栏目时，在 frontmatter 中显式保留栏目：

```markdown
---
id: 51f3e126-f6a0-4ef3-a4fb-6dca72b85afd
title: 独立目录里的文章
category: life
createdAt: "2026-10-10T09:00:00+08:00"
---

正文照常书写。

![插画](./assets/illustration.png)
```

图片位于 `~/writing/assets/illustration.png`。打开文件后运行预览命令，即可显示“生活旁白”、文章标题、日期与图片；输入、源行跟随和单击反向定位与正式文章一致。`category` 使用 `play/life/learn`；位于三个中文栏目目录内时也可由路径识别，不会给缺少栏目线索的文件猜测栏目。旧式独立文章使用 `title/category/date`，本地图片同样放在旁边的 `assets/`。

位于 Sachi 项目中、只打开项目中的子文件夹，或只有一个 Sachi 工作区时，继续读取对应项目的实时样式、公开个人资料与头像。没有关联项目时使用 VSIX 自带的博客样式和署名，多项目工作区中不会随意选用其他项目的配置。预览额外位置的文章不表示 CLI 自动将它加入正式内容目录或发布集合。

查看归档无需复制回正式 `content/`。预览不会修改文件；如果手动改写存档的原文或素材，稿件完整性校验会失败。继续写作应编辑当前文章，回档使用 CLI 的 `draft restore`。

默认跟随当前文章编辑器。设置 `sachiPreview.followActiveEditor` 为 `false` 可固定当前文章；再次执行打开预览命令可切换。`sachiPreview.debounceMs` 可调整刷新等待时间。刷新通过消息更新 React 内容，保留同一篇文章的阅读位置，不重新加载整个 Webview。

## 预览宽度与局部环绕

默认 `sachiPreview.layoutMode: "responsive"` 跟随面板宽度。命令 **Sachi Blog: 切换桌面宽度／响应式预览** 或预览顶部按钮可切到 720px 正文的桌面模式，窄面板允许横向滚动，选择保留在当前面板。设置 `desktop` 可改变默认模式。

引用、列表、表格、代码与署名共用网站样式，引用不会套用 VS Code 的主题背景。响应式模式在相同宽度下采用网站的正文留白；桌面模式完整采用桌面排版，包括标题行高、元信息和代码块间距。对照网站时请使用同一版正文和对应宽度；网站读取已保存的文件，插件也显示未保存修改。

flow 不再依赖二级标题。配置图片附近的连续纯文本自动形成区域，任意标题、分隔线、列表、引用、表格、代码、富文本或其他图片是边界。空行只分段。单对象保持兼容，多张图片使用数组：

```yaml
flow:
  - image: ./assets/illustration.png
    width: 180
    defaultX: 0.53
    defaultY: 54
  - image: ./assets/photo.png
    width: 240
    defaultX: 0.5
    defaultY: 20
```

正文仍写独立的 `![说明](./assets/illustration.png)`，引用式图片也支持。同一连续区出现多张配置图片时增加普通块边界，插件只暂用普通排版该区域。字段和真实教学效果见[环绕教程](../../docs-site/writing/flow.md)。

width 控制完整画布宽度（默认 205，96–360px），只在容器不足时缩小；没有移动端 165px 或图片 360px 高度上限，不裁掉透明留白。位置以各自区域为基准，调整参数立即重排并清除该区域的临时拖动。网站阅读会将拖动位置记在浏览器 localStorage 中，插件写作预览保持临时位置，便于核对作者的默认配置。状态区明确显示环绕、普通图文或降级以及原因。

## 单击预览回到源码

默认单击预览中的文字或非互动图片，就会把编辑器光标移到对应源码并聚焦编辑器，可以接着输入。预览保持只读，定位不会改写文章、保存文件或增加撤销步骤，也不会重新居中预览窗口。

支持普通正文、正文标题、强调、列表、引用、表格、行内代码、高亮代码和图文环绕；转义符、字符实体、`::` 缩进和代码的原始缩进都会计入源位置。复杂内容无法精确换算时，定位到对应源码片段的起点。点击文章顶部标题定位到 frontmatter 的 `title` 字段；日期、栏目、署名、状态提示和空白区域不触发。

普通图片和非互动环绕图片定位到 Markdown 图片语句起点；引用式图片定位到正文引用语句。开启互动后图片用于拖动和方向键移动。

拖动选字、右键、链接、代码复制、视频操作与环绕图片拖动保留原行为。单击跳转优先于预览中的双击选词。预览有未保存修改尚未刷新，或 YAML 无效仍显示旧正文时，不会把光标跳到旧位置；内容恢复有效后即可继续点击。

设置 `sachiPreview.clickToSource` 为 `false` 可关闭。它与 `sachiPreview.syncScroll` 独立，关闭自动滚动同步后，单击定位仍可使用。固定预览时，点击会返回固定文章；源编辑器关闭后会在原编辑器分组重新打开文章，保留预览面板。

## 跟随编辑位置

默认移动光标、点击某一行、用“转到行”跳转或滚动编辑器，右侧预览会定位对应内容并轻微标记。目标已经处于可读区域时不反复滚动；远处的目标滚动到窗口上方约四分之一处。只更新定位消息，不重新渲染正文，也不转移编辑器焦点。

- 普通正文根据 Markdown AST 的源行和列定位，支持强调、列表、引用、表格、图片和代码块中的具体行；长源行中的光标列用于选择对应的视觉行。
- `\` + `::` 仍是一段内的紧凑换行，能分别定位每行。Pretext 环绕使用实际排版行的源文字范围；字体加载、图片尺寸或窗口宽度变化后重新计算位置。窄屏和引擎失败时使用完整 DOM 正文定位。
- frontmatter 定位到文章标题区；空行、分隔符和引用定义等没有独立视觉内容的行定位到最近的正文块。Markdown 符号附近的列位置按渲染文字范围近似映射。
- 在预览里用滚轮、触摸、键盘阅读或拖动环绕图片时，暂停自动重排后的定位；回到编辑器移动光标或滚动即可继续跟随。同一版本的资源刷新会保留手动阅读位置。

设置 `sachiPreview.syncScroll` 为 `false` 可关闭自动跟随；命令面板中的 **Sachi Blog: 定位当前编辑行** 始终可手动定位。未保存修改使用文档版本匹配，正文尚未刷新时暂存定位请求，避免跳到旧内容；无效 YAML 保留上次预览，修正后恢复。

## 支持的博客内容

| 内容 | 预览行为 |
| --- | --- |
| frontmatter | 复用博客元数据适配：目录栏目、标题、日期、tags、status、minutes |
| GFM | 标题链接、强调、列表、引用、表格、任务列表、代码复制 |
| 语法高亮 | 与网页共用 11 种语言定义和浅色高亮样式；代码颜色不随 VS Code 主题改变 |
| 首行缩进 | 段首或显式换行后的行首写 `::正文`，显示约两个字宽的缩进，支持普通正文与 flow；`\::正文` 显示字面符号 |
| 本篇图片 | 标准 Markdown 图片语法，显示图片说明；引用式图片也支持 |
| 视频 | 同样的图片语法自动识别 mp4/webm/mov/m4v，原生播放器；支持 media.yaml 的 poster |
| 附件 | 本篇 assets 中的附件链接，点击通过 VS Code 打开 |
| 文章/系列链接 | `blog:<UUID>`、`/article/<slug>/`、`series:<UUID>`、`/series/<slug>/`；点击打开当前内容仓库的源文件 |
| 图文环绕 | 仍使用 frontmatter.flow；透明图片自动生成轮廓，也支持手工 contour，使用真实 Pretext 互动组件 |
| 末尾署名 | 读取项目 profile.json 和 src/assets/avatar/avatar-half.png |

插件复用博客的 Markdown 扩展规则。手册站的 `::: tip` 不属于博客语法。`cover` 是列表封面，文章内容区不额外插入封面；系列目录/前后篇导航属于站点阅读导航，此预览聚焦当前正文。视频仍受 VS Code 内置浏览器的编码支持限制。

正文宽度小于 520 px 或窗口不超过 600 px 时，环绕显示完整普通排版。环绕配置暂时不完整、图片/轮廓/引擎出错时同样保留完整正文并显示提示。YAML 或其他元数据无效时，显示错误并保留上一次有效预览；修正后自动恢复。

## 代码语言与高亮

在代码围栏开头标注语言即可启用高亮，例如：

````markdown
```ts
const title: string = "中文笔记";
console.log(title);
```
````

支持 JavaScript（`javascript`、`js`、`jsx`）、TypeScript（`typescript`、`ts`、`tsx`）、Python（`python`、`py`）、Bash（`bash`、`sh`）、JSON（`json`）、YAML（`yaml`、`yml`）、HTML（`html`、`xml`）、CSS（`css`）、Java（`java`）、Go（`go`、`golang`）、Rust（`rust`、`rs`）。只打包这些语言的定义文件，无需联网加载。

不标语言，或标注 `text`、`plaintext`、未知语言时，保留深灰色纯文本，不自动猜测。高亮异常也保留完整原文。行内代码继承所在段落、标题或链接的文字颜色；博客和预览使用同一浅色主题，不跟随 VS Code 的深色主题。高亮保留空格、空行、末尾换行、代码复制和编辑器逐行定位。

已有插件升级到 0.4.2 时，重新构建、打包并安装 VSIX；后续修改关联项目的 `code-highlight.css` 会实时刷新预览。

紧凑换行与缩进可以组合：

```markdown
第一行正文。\
::下一行缩进两个字。
```

两行属于同一段，保持正常行距；空行分段仍保留段落间距。此组合在普通正文、Pretext 环绕、窄屏和打印中都有效。单次普通回车继续遵循 Markdown 的软换行规则。

图片、视频和附件示例：

```markdown
![图片说明](./assets/photo.png)
![视频说明](./assets/demo.mp4)
[下载附件](./assets/notes.pdf)
```

## 实现方案

- **Extension Host**：监听 TextDocument 的内存内容，使用共享 `src/lib/blog/document.ts` 与 schema 做元数据适配，映射文章资源为 `asWebviewUri`，发送版本化消息。连续修改后只接受最新版本。
- **Webview**：直接使用博客的 `ArticleIntro`、`ArticleProse`、`MarkdownContent`、`FlowParagraphs` 和 `AuthorSignatureView`，读取根项目的 tokens.css/site.css/code-highlight.css。预览字体、颜色、正文尺寸、语法高亮和栏目差异与博客使用同一实现。
- **自动轮廓**：Webview 用 Canvas 采样，发布端继续使用 Sharp；共用 alpha 边界算法，最高 256 px 采样，不把 Sharp 原生模块装进插件。两种图像缩放器在边缘采样上可能有细微差异，最终发布验收仍以博客构建为准。
- **源行定位**：预览独立启用 AST 源位置标记，环绕将 Pretext 的字素游标映射回源文字范围。发布博客默认不启用这些标记。定位与正文消息分别传输，用文档路径、版本和序号过滤过期请求。
- **隔离**：不启动 Next.js、不执行工作区脚本、不写回文章，不构建或发布。明确打开 `.blog-store` 中的稿件时只读取该文章及其资源，不扫描其他稿件或发布集合。图片与附件限定本篇 assets（旧内容集合使用各自 public/assets），拒绝越界和符号链接；Webview 有 CSP，关闭时清理监听与任务。
- **打包**：esbuild 把共享组件和依赖打包到 VSIX；项目 CSS、个人资料和头像会实时读取。共享 TypeScript 渲染组件或插件源码变化后重新构建并安装 VSIX。

## 验证与开发

```sh
npm run check
npm run preview:build
npm run preview:test:host
npm run test:browser
npm run preview:package
```

`preview:test:host` 在临时多文件夹工作区和独立 VS Code 用户目录中运行真实 Extension Host/Webview 测试，检查未保存正文、错误恢复、自动轮廓、源行/代码行/表格定位、编辑器滚动、关闭跟随与手动定位、资源刷新、快速输入、切换文章和关闭清理。同时验证完整稿件、导出的旧式文章、工作区外的独立文章和样式切换；第二个隔离窗口验证没有工作区的单文件预览、环绕、资源刷新与双向定位。不访问实际 GitHub 或服务器。默认使用 macOS 的 `/Applications/Visual Studio Code.app/Contents/MacOS/Code`，其他安装位置通过 `VSCODE_EXECUTABLE` 指定桌面可执行文件。

Webview 与资源访问参考 [VS Code 官方 Webview API](https://code.visualstudio.com/api/extension-guides/webview)；安装包参考 [官方扩展打包文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions)。本插件使用本地标识 `sachi-local.sachi-blog-preview`，无需发布到 Marketplace。
