# 排版测试内容

`content/` 中的 排版与系列测试 Markdown 都是 `fixture: true` 的测试数据，不是真实博客文章。

- 日常 `npm run dev` 和 Blog CLI 只读取`.blog-store/content/`，不加载这里的样例。
- `npm run dev:fixtures` 在 127.0.0.1:4176 显式预览测试内容，使用独立 Next 缓存。
- `npm run test:browser` 自动启动上述服务，不复用日常写作预览。
- `npm run build:fixtures` 只使用这里的排版样例；正式 `npm run build` 仍只读取发布快照。

## 特殊块集中测试页

运行 `npm run dev:fixtures` 后访问 [特殊块排版样例](http://127.0.0.1:4176/article/special-blocks/)，或在 fixture 首页点击“查看特殊块排版样例”。

样例正文在 `content/special-blocks.md`，涵盖行内／独立公式、矩阵与多行公式、无效公式降级、11 种代码语言、纯文本与长代码、对齐／宽表格、嵌套引用与列表、任务清单、脚注、图片说明及标题层级。全部使用共享文章渲染器，没有单独的示意样式。目录可直接跳到各小节。

调整正文与块间距用 `src/styles/site.css` 和 `src/styles/tokens.css`；代码高亮用 `src/styles/code-highlight.css`；公式字号、留白及滚动用 `src/styles/math.css`（路径均相对项目根目录）。保存后开发预览会刷新。可将窗口缩到 390／360 px 查看横向滚动，也可用浏览器打印预览检查纸面效果。

公式使用 `$...$`（行内）或独占行的 `$$`（独立块），由共享 Markdown 流水线在渲染时生成 KaTeX HTML 与可访问的 MathML；字体随本地构建提供，不依赖 CDN。字面美元符号写成 `\$`。含公式的段落保持普通 DOM 排版，不进入纯文本图文环绕。

旧格式引用的共享图片继续使用 `public/assets/`。不要把测试正文复制回`.blog-store/content/`，也不要将样例改标为正式文章发布。
