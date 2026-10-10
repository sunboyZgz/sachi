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

代码块自动提供“复制”按钮，复制完整代码及换行，不包括按钮文字；浏览器不允许复制时会提示手动选择代码。无 JavaScript 和打印时隐藏按钮，代码仍完整显示。自动复制需要安全上下文，正式站建议使用 HTTPS，详见 [Clipboard API 说明](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)。

正文标题旁提供 `#` 小节链接，桌面悬停或键盘聚焦时显示，移动端直接显示；点击定位，右键可复制链接地址。小节 ID 沿用现有 Markdown 规则，与文章目录一致，不需要另写 HTML。修改标题可能改变小节地址；相同标题按顺序添加后缀区分。

- 图片和视频：`![说明](./assets/文件名)`。
- 下载附件：`[下载](./assets/notes.pdf)`。
- 文章链接：`[阅读](blog:<UUID>)` 或 `/article/<slug>/`。
- 环绕：仅 frontmatter.flow，不增加 layout.yaml。

## 正文块的使用示例与生成效果

下面是标题、代码块和 GFM 表格／任务列表的完整正文示例。预览复用博客实际 Markdown 组件，不使用文档站自己的代码块来冒充博客效果。

<<< @/.vitepress/examples/reading.md

<BlogExample example="reading" />

可在框内点击标题旁的 #，或点击代码块“复制”按钮；复制成功会短暂显示“已复制”。无 JavaScript 时代码和表格仍完整显示，复制按钮隐藏。任务列表是阅读内容，不是用来回写 Markdown 的待办编辑器。

自定义资源与环绕的可复制示例和预览分别在[图片／封面](/writing/images)、[视频](/writing/video)、[附件](/writing/attachments)、[文章链接](/writing/links)和[文字环绕](/writing/flow)页。不要把 VitePress 专用的提示框语法当成博客支持的自定义块。

## 保存与公开

正文保存不会自动上线。fixture 和未选草稿不纳入生产；普通 Git 提交、精选设置和开发预览都不能替代明确发布。

## 相关操作

[新建](/writing/new) · [元数据修改](/writing/edit-meta) · [环绕图片](/writing/flow) · [媒体配置](/setup/media)
