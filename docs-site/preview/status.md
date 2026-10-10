---
title: 识别本地与线上状态
scope: read
files: 远端核实后可更新本地清单与 Pages 状态
network: 选择服务器或 Pages 核实时需要
online: 不改变
---

# 识别本地与线上状态

## 什么时候用

需要判断文章是草稿、已发布、已修改还是已撤回时使用。区分本地缓存与远端核实，避免把未知状态误认作已上线。

## 开始前

正式文章已经创建。要核实线上需部署或 Pages 配置；本地缓存不能证明实际公开状态。

## 操作步骤

1. 进入“查看文章状态 · status”。

2. 没有部署或 Pages 时查看本地信息；已配置时选择缓存或只读服务器 / Pages 查询。

3. 检查 releaseId、checkedAt 和数据来源。CACHED 表示未核实，VERIFIED 表示本次已查询。

4. 识别 draft（草稿）、published（同修订已发布）、modified（有未发布修订）、withdrawn（撤回）、missing（线上存在、本地缺失）。

5. 本地缓存模式的文章可能统一标为 unverified，不能直接判断线上已更新。

6. 发布、恢复或回滚后再查询服务器，确认期望版本。

### 文章状态与下一步

| state | 含义 | 常用下一步 |
| --- | --- | --- |
| draft | 已核实的公开清单中没有这篇文章 | 本地检查 / 预览，准备好后明确发布 |
| published | 当前本地修订与公开快照一致 | 无需为了保存再发布 |
| modified | 已公开，但本地正文、元数据或引用素材有变化 | 确认修改后只选这篇发布 |
| withdrawn | 当前已撤回，历史身份仍保留 | 可用同一身份重新发布，不改 slug |
| missing | 线上有文章，本地找不到原稿 | 先恢复；本地缺失不等于撤回 |
| unverified | 本次只看缓存，无法确认线上状态 | 配置目标后执行 status --remote |

### Pages 或双目标怎么判断

Pages 的结果在 `pages` 字段单独给出。`QUEUED_OR_UNKNOWN` 表示尚未读到与候选版本一致的标记，不应当作 DEPLOYED。查看 Actions 是否成功、是否等待环境审批，再重跑查询。

同时配置服务器与 Pages 时，文章列表依据服务器清单；还要单独看 Pages 状态，不能因为顶层 VERIFIED 就认为两个网站都已更新。分别比较各目标的 releaseId 与本次发布回执。

只在一次 push 上用了 `--pages-remote` 时，目标不会自动保存给 status。后续核实前先在配置中设置同一目标；不要在 origin 指向其他仓库时误查另一站点。[Pages 目标优先级](/setup/github-pages)。

## 确认结果

服务器清单或已核实的 Pages release-marker 才是对应目标的公开状态依据。本地删除文章会显示 missing，而不会自动撤回。未配置任何远端时，即使用 --remote 也没有线上事实可核实。

## 影响与取消

普通远端状态查询可更新 .blog-store/current.json；加 --dry-run 不保存当前清单。不会切换公开版本。

## 常见问题

空列表可能只有 fixture，没有正式文章。UNKNOWN 后先远端核实；不要仅看缓存就重复发布。

## 参数方式

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog -- status
npm run blog -- status --remote
npm run blog -- status --remote --dry-run
```
