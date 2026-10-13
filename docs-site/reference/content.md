---
title: 文章与目录契约
scope: reference
---

<script setup>
import BlogExample from '../.vitepress/theme/BlogExample.vue'
</script>

# 文章与目录契约

## 文件放在哪里

```text
content/
  生活旁白/
    2026-10-03/
      index.md
      assets/
        cover.jpg
        demo.mp4
      media.yaml     # 可选
```

另两个栏目是“闲暇娱乐”“蘸豆！！”，精确保留两个感叹号。新建目录按配置时区计算日期，同日新增带 -02、-03。旧 `content/*.md` 文章格式继续兼容；排版样例已移到 `tests/fixtures/content/`，仅用于显式测试预览，fixture 禁止发布。

## 元数据

```yaml
---
id: "<新建生成的UUID>"
title: 秋天的一杯茶
slug: a-cup-of-tea
createdAt: "2026-10-03T09:30:00+08:00"
tags: [日常]
cover: ./assets/cover.jpg
summary: 在一杯茶的时间里写下一点观察。
featured: false
---
```

| 字段 | 作用 | 操作约束 |
| --- | --- | --- |
| id | 稳定文章身份 | 新建自动生成，不随标题、栏目变化 |
| title | 显示标题 | 非空，可修改 |
| slug | 固定 URL | 曾发布后不能直接修改，包括撤回后 |
| createdAt | 创建时间 | 用配置时区显示本地日期 |
| tags、summary、cover | 描述与封面 | 可选，资源必须在本篇范围内 |
| minutes | 阅读分钟数 | 自动计算；覆盖时使用正整数 |
| status | 项目状态 | 可选，默认“记录” |
| featured | 栏目精选 | 布尔值，不控制是否公开 |
| series | 系列归属与序号 | `{ id: 系列UUID, order: 正整数 }`；同系列同栏目、序号唯一，可省略 |
| flow | 局部环绕 | image 必填，contour 可省略自动生成；width/alt/位置可配置，与图片一起冻结 |

栏目由目录映射为 play／life／learn。首次发布时间由成功发布清单保留，重新发布或撤回后恢复不重新计算成“新文章”。

## 正文与资源

使用 AST／GFM，允许常见标题、列表、表格、代码块与引用式链接；不允许任意原始 HTML。资源使用本篇 assets，相对路径不能越界，也不能是符号链接。代码块中的引用示例不作为真实依赖。

正文段落开头写 `::`，渲染时会替换为两个 em 空格，实现约两个字宽的首行缩进；标记后可以直接接文字，也可以留一个普通空格。段落之间留空行：

```markdown
::这是首行缩进的第一段。

::这是首行缩进的第二段，可以有 **强调** 或链接。
```

如果需要换行后缩进，同时保持同一段落的紧凑行距，在上一行末尾写反斜杠 `\`，下一行开头写 `::`，中间不留空行：

```markdown
网站呈现的设计风格都符合个人喜好的博客工具。\
::可是，在过去如果不使用其他人的模版……
```

这会生成一个段落中的显式换行，下一行缩进两个字；不会增加段落间距。行末两个普通空格的显式换行也支持这个组合。单次普通回车仍是软换行，下一行的 `::` 保持字面内容。

博客、VS Code 插件、打印和无 JavaScript 阅读共用这个规则，`flow` 开头的纯文本段落也支持显式换行与缩进。代码、标题、表格、图片段落、正文中间的冒号和 `::: tip` 不进行替换。要在段首或显式换行后显示字面上的两个冒号，写 `\::正文`。文件中保存的仍是 `::`，不会回写为 HTML 实体；自动摘要会去掉缩进标记。

### 对照正文写法与实际效果

下面是首行缩进、标题、代码块和 GFM 表格／任务列表的完整正文示例。预览复用博客实际 Markdown 组件，不使用文档站自己的代码块来冒充博客效果。

<<< @/.vitepress/examples/reading.md

<BlogExample example="reading" />

可在框内点击标题旁的 #，或点击代码块“复制”按钮；复制成功会短暂显示“已复制”。无 JavaScript 时代码和表格仍完整显示，复制按钮隐藏。任务列表是阅读内容，不是用来回写 Markdown 的待办编辑器。

自定义资源与环绕的可复制示例和预览分别在[图片／封面](/writing/images)、[视频](/writing/video)、[附件](/writing/attachments)、[文章链接](/writing/links)和[文字环绕](/writing/flow)页。不要把 VitePress 专用的提示框语法当成博客支持的自定义块。


代码块自动提供“复制”按钮，复制完整代码及换行，不包括按钮文字；浏览器不允许复制时会提示手动选择代码。无 JavaScript 和打印时隐藏按钮，代码仍完整显示。自动复制需要安全上下文，正式站建议使用 HTTPS，详见 [Clipboard API 说明](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)。

代码围栏开头标注语言即可高亮。支持 JavaScript（`js`、`jsx`）、TypeScript（`ts`、`tsx`）、Python（`py`）、Bash（`sh`）、JSON、YAML（`yml`）、HTML（`xml`）、CSS、Java、Go（`golang`）、Rust（`rs`），也支持这些语言的完整名称。网页、文档中的博客示例和 VS Code 文章预览共用浅色高亮样式。未标语言、`text`、未知语言或高亮异常时保留完整深灰色代码，不自动猜测语言。

正文标题旁提供 `#` 小节链接，桌面悬停或键盘聚焦时显示，移动端直接显示；点击定位，右键可复制链接地址。小节 ID 沿用现有 Markdown 规则，与文章目录一致，不需要另写 HTML。修改标题可能改变小节地址；相同标题按顺序添加后缀区分。

文章主标题来自 frontmatter 的 `title`。正文中的 `#`、`##`、`###`、`####` 分别用于篇章、分节、小节和次级说明，使用不同字号和留白；正文开头的标题与连续出现的标题会自动收紧上方间距，仍保留原来的 Markdown 语义层级。

本文目录收录正文中顶层的 h1–h6，以实际存在的父子关系编号、缩进，跳过未出现的层级；引用或列表内部的标题只保留在正文中。只有 h2 或只有 h4 的文章都使用 `01`、`02` 等平级编号。桌面侧边目录与手机折叠目录共用这些标题和小节地址。

例如为了正文样式使用四级标题，可以直接这样写：

```markdown
# 大章节

#### 第一个小节

#### 第二个小节
```

目录显示两级：`01 大章节` 下是 `01.1 第一个小节`、`01.2 第二个小节`。正文仍然使用 h4 的字号和留白，不需要补写 h2、h3 或修改原始 Markdown。

- 图片和视频：`![说明](./assets/文件名)`。
- 下载附件：`[下载](./assets/notes.pdf)`。
- 文章链接：`[阅读](blog:<UUID>)` 或 `/article/<slug>/`。
- 环绕：仅 frontmatter.flow，不增加 layout.yaml。

## 数学公式与排版样例

行内公式写作 `$E = mc^2$`，独立公式在前后各用一行 `$$`，例如：

```markdown
行内公式 $\sqrt{x^2+y^2}$ 与正文一起排版。

$$
x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}
$$
```

公式在共享 Markdown 渲染时生成 KaTeX HTML 与可访问的 MathML，博客和 VS Code 预览使用相同规则；无 JavaScript 阅读仍显示公式。长公式在自己的区域内横向滚动，非法公式保留可读的原文。字面美元符号写成 `\$`。含公式的段落采用普通 DOM 排版，不进入纯文本环绕。

调试 UI 可运行 `npm run dev:fixtures`，访问 `http://127.0.0.1:4176/article/special-blocks/`，或点击测试首页的“查看特殊块排版样例”。该页集中展示公式、11 种代码语言、宽表格、引用、列表、脚注及图片说明，测试正文在 `tests/fixtures/content/special-blocks.md`，不进入日常开发预览或发布集合。

## 保存与公开

正文保存不会自动上线。fixture 和未选草稿不纳入生产；普通 Git 提交、精选设置和开发预览都不能替代明确发布。

## 相关操作

[新建](/writing/new) · [元数据修改](/writing/edit-meta) · [环绕图片](/writing/flow) · [媒体配置](/setup/media)
