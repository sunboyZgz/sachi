---
title: 写诗与居中排版
scope: local
files: 创建或修改文章 type 元数据
network: 不需要
online: 不改变
---

<script setup>
import BlogExample from '../.vitepress/theme/BlogExample.vue'
</script>

# 写诗与居中排版

## 什么时候用

整篇文章是一首诗，希望按作者写下的行和诗节呈现，并将标题、每行诗句居中时使用。仍使用 Markdown 文件，由 `type: poem` 选择排版。

## 开始前

选择现有三个栏目之一。已有文章继续保留 id、slug、createdAt；没有类型字段的文章按普通 Markdown 处理。

## 操作步骤

1. 新建时选择“诗歌 Markdown”。从 `npm run blog` 的 new 菜单，或直接运行新建命令，都能选择类型。

   ```sh
   npm run blog -- new
   ```

   ```text
   选择文章栏目 → 生活旁白
   文章类型     → 诗歌 Markdown
   文章标题     → 寄给春天的信
   ```

   返回 CREATED，包含 type: poem、完整 ID 和实际资料路径。参数方式也支持：

   ```sh
   npm run blog -- new --category life --title "寄给春天的信" --type poem
   ```

2. 打开返回的 index.md，直接逐行写诗。每次回车生成诗行换行，空行划分诗节；不需要在行末写 `\`、插入 HTML 或为每行添加居中标记。以下是独立教学源码与真实渲染效果：

   <<< @/.vitepress/examples/poem.md

   <BlogExample example="poem" />

   标题取自 frontmatter.title，正文不用重复写标题。每行围绕同一中轴居中，诗节间留出更大的间距；强调与链接仍可使用。窄屏长诗行允许自然折行，原始行结构与完整文字保留。

3. 已有文章可通过元数据菜单勾选“文章类型”，选择“诗歌 Markdown”，或使用参数：

   ```sh
   npm run blog -- meta <文章> --type poem --dry-run
   npm run blog -- meta <文章> --type poem --yes
   ```

   预演只展示计划，确认后写入 type: poem，保留原正文、注释与换行。也可在原 frontmatter 手动添加 `type: poem`，或用 `--set 'type=poem'`。切回普通排版使用 `--type article`。

   接入还没有 ID 的手写诗歌时，`meta --init` 在终端为未填写类型的文章提供选择，已有 type 会保留。参数方式可一次补身份并选择诗歌：

   ```sh
   npm run blog -- meta <文章路径> --init --type poem --yes
   ```

   返回 UPDATED，补齐 ID、创建时间并写入 poem，正文仍为原始诗行。

4. 使用本地检查和预览核对诗行、诗节与标题。

   ```sh
   npm run blog -- check <文章>
   npm run blog -- dev --post <文章>
   ```

   检查返回 VALID。VS Code 插件实时读取未保存的 type 与正文；逐行跟随与点击定位使用原 Markdown 行列。网站、插件、无 JavaScript 阅读和打印共用排版规则。

## 确认结果

每个正文顶层诗节里的回车都显示为换行，空行开始新诗节，标题和诗行居中。代码、公式、列表、引用、表格与含图片的段落沿用各自的 Markdown 排版。只添加 type 不会改写原文或自动发布。

## 影响与取消

新建与修改仅写本地资料。输入时 Ctrl+C 不创建文章；元数据修改在确认取消后不写入。公开旧版继续保留，需明确发布本篇修订后才更新。

## 常见问题

- 普通文章中的一首诗：当前开关作用于整篇文章的正文段落，暂未提供局部诗歌块。
- 已有 flow：诗歌与 flow 不能同时启用，以免改变作者的诗行形状。可通过 `--type poem --set 'flow=null'` 明确移除配置；正文图片与源文件保留。
- 模板：poem 使用 `templates/poem.md`，缺失时使用内置诗歌模板；`blog init` 补齐缺失模板并保留已有文件。脚本未指定类型时沿用 post.md 的 type 或普通文章，菜单和显式参数优先。
- 旧文章：type 缺省视为普通文章；`--set 'type=null'` 删除字段恢复缺省行为，不批量改写旧文章或快照。
- 想保留缩进：没有自动首行缩进；需要时仍可显式写 `::`。不要给只需居中的诗句添加它。

## 参数方式

`new --type article|poem` 创建对应文体，`meta --type article|poem` 修改一篇已有文章。两者保留 `--dry-run` 与 `--json`；完整选项见 [new](/reference/commands/new) 和 [meta](/reference/commands/meta)。
