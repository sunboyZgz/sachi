---
title: 链接另一篇文章
scope: local
files: 修改 Markdown 链接
network: 不需要
online: 不改变
---

<script setup>
import BlogExample from '../.vitepress/theme/BlogExample.vue'
</script>

# 链接另一篇文章

## 什么时候用

正文需要引用本站另一篇文章时使用。链接可以稳定引用文章身份，但目标草稿不会因此被自动发布。

## 开始前

知道目标 ID 或 slug；发布时目标必须在候选公开清单中。

## 操作步骤

1. 用中文标题查到目标身份，优先稳定 ID；也可使用原有文章信息或状态列表。

   ```sh
   npm run blog -- search "朝思暮想"
   ```

   根据目标标题查到 ID，核对栏目与文件路径。

2. 写 `[继续阅读](blog:<目标UUID>)` 或 `[继续阅读](/article/<目标slug>/)`。

   ### 写法与实际效果

   假设目标文章的 ID 为 `51f3e126-f6a0-4ef3-a4fb-6dca72b85afd`，slug 为 `slow-notes`。这些是教学身份，写自己的文章时要换成 status 或 meta 查到的真实值：

   <<< @/.vitepress/examples/article-link.md

   <BlogExample example="article-link" />

   两条链接显示为普通可点击文字。正式博客通过候选发布清单把 `blog:ID` 转换成 `/article/slow-notes/`；slug 写法直接引用该固定地址，部署在 Pages 子路径时会加上 `/仓库名/`。预览中的两条链接都指向独立的教学目标页，不会尝试打开不存在的博客文章。

   | 输入 | 正式博客中的地址 | 后续修改 |
   | --- | --- | --- |
   | blog:51f3e126-f6a0-4ef3-a4fb-6dca72b85afd | /article/slow-notes/ | 按文章身份查找；改标题或目录不影响引用 |
   | /article/slow-notes/ | /article/slow-notes/ | 依赖固定 slug；曾发布 slug 不可直接更换 |

   如果目标仍是未选草稿，生成效果不是“自动公开目标”：发布检查会报未发布引用，并停止计划。需要明确把两篇加入同一候选集合，或先修改链接。

3. 检查正文，再看发布计划。

   ```sh
   npm run blog -- check <文章>
   npm run blog -- publish <文章> --dry-run
   ```

   检查当前文件后再核对候选公开集合。

4. 目标是草稿时明确选择一起发布，或先移除链接；CLI 不会自动发布目标草稿。

   ```sh
   npm run blog -- publish <当前文章ID> <目标文章ID> --dry-run
   ```

   目标仍是草稿时必须明确一起选择；核对后再执行。

5. 撤回目标前先修改并发布仍引用它的公开文章。

### 找到正确目标

在菜单中查看目标文章信息，记下完整 id 和 slug；参数方式可用 `npm run --silent blog -- meta <目标文章路径> --json`。标题会改变，不能拿标题直接替换 `blog:<UUID>`；日期目录也不是网页地址。

引用篇与目标篇都还是草稿时，只通过 check 不足以确认公开链接；在 publish 计划中同时明确选择两篇。若目标已经公开，本次不选它也会保留旧快照，链接仍指向那个公开版本。

### 链接到本篇小节

先在预览中点击标题旁 `#`，复制实际片段，再写成 `[回到记录](#记录)` 这样的 Markdown 链接。标题含标点、重复标题或后续改名时，不手算片段，重新复制实际链接并核对。目录只列二级标题，小节链接与目录沿用同一套 ID 规则。

普通 HTTP(S) 外部文字链接可用，但 CLI 不联网证明目标有效；发布前由你打开检查。附件链接仍遵循本篇 assets 规则，不能把其他文章的磁盘路径当站内链接。

## 确认结果

链接目标属于公开集合，发布引用检查通过。

## 影响与取消

编辑只改变本地文件；链接不授予目标草稿公开权限。

## 常见问题

普通外部链接不强制联网验证，未发布的 ID／slug 引用会报错。

## 参数方式

本页步骤旁已给出对应写法与结果说明。完整参数可在[命令索引](/reference/commands)按操作名查看；示例占位符请换成实际值，已安装简短命令时可把 `npm run blog --` 换成 `blog`。
