---
title: 首次发布选中文章
scope: public
files: 冻结包与发布记录；保留原稿
network: 部署连接；Git 配置后备份
online: 确认执行后切换公开版本
---

# 首次发布选中文章

## 什么时候用

已完成服务器或 GitHub Pages 配置，希望第一次明确公开选中的文章时使用。未选草稿不会上线，Git 备份不是发布前提。

## 开始前

先完成[服务器配置](/setup/server)或[GitHub Pages 配置](/setup/github-pages)并检查文章。Git 备份不是发布前提；本地验收部署不是公网服务器。

## 操作步骤

1. 打开主菜单，选择“发布选中文章 · publish”。

2. 空格勾选明确要公开的文章，默认不勾选任何文章；排版样例不会出现。

3. 先选择只看计划，核对选中修订、保留旧快照、排除草稿和全站基线。

   ```sh
   npm run blog -- publish <文章> --dry-run
   ```

   先核对 PLANNED 的内容范围与交付目标。

4. 再次打开同一操作，选择执行并重新核对计划。检查通过不等于预演冻结。

   ```sh
   npm run blog -- publish <文章>
   ```

   重新规划并确认后才冻结、构建与交付。

5. 有代码／资源基线变化时单独接受；核对最终执行确认，默认取消。

6. 等待冻结源快照、可选 Git 备份和隔离构建。随后执行已配置的服务器部署和 Pages 推送两个钩子；服务器健康检查失败会恢复旧 current，Pages 由 Actions 先构建、再部署。main 分支保持不变。

7. 运行 status --remote 核实 releaseId，再在正式网站打开文章与媒体。

   ```sh
   npm run blog -- status --remote
   ```

   服务器看 current；Pages 必须匹配 release-marker，不仅是 QUEUED。

### 第一次发布前的最后核对

1. 列表里选中的是正式文章，不是教学 fixture；打开原稿确认没有测试文字、秘密或不应公开的附件。
2. 图片、封面、视频 poster、flow 图片和轮廓都在本篇 assets；检查没有用电脑绝对路径。
3. 站内链接的目标也在候选集合；外部链接由你打开核对。
4. 计划中的部署目录 / GitHub 仓库是本次目标。Git 内容备份的地址不是网站地址。
5. 个人信息、头像和 SEO 已确认；有全站基线变化时清楚知道它会影响所有页面。

### 按实际部署方式选入口

| 配置 | 执行方式 | 成功后还要看什么 |
| --- | --- | --- |
| 只有 deploy（SSH / 本地验收） | `publish <文章>` | 服务器 DEPLOYED；local 只表示本机验收完成 |
| 只有 pages | `publish <文章>`，或先 build 再 push 冻结 ID | PUSHED 后等待 Actions，再查 Pages 标记 |
| deploy 与 pages 都有 | `publish <文章>` 或 push 冻结 ID | 分别核对 server 与 pages 两个 hooks |
| 都没有 | 先用 build，不执行上线 | BUILD_ONLY 不代表公开 |

如果想上线的必须是“刚刚验收过的那一个包”，含 Pages 时使用实际 releaseId 执行 push；但 **push 会启用 Pages 目标解析**，服务器单目标用参数方式 `publish --resume <实际release-id>` 交付完整包，不用 push 替代。[继续冻结发布](/release/resume)。

### 怎样知道真的完成了

保存本次 releaseId，等命令结束后运行 `npm run blog -- status --remote`。服务器部署核对 current；Pages 还要读到相同 ID 的 release-marker。打开正式网站，依次看首页、目录、文章、图片 / 视频 / 下载链接，再核对未选文章仍是旧版。

不要在 Pages QUEUED 时立即发布下一个版本。Pages-only 必须先核实该版本已上线；双目标也应让两端完成并核对后，再开始下一次发布。

## 确认结果

服务器部署成功返回 DEPLOYED；启用 Pages 时返回 PUSHED，并分别列出两个 hooks 的结果。Pages QUEUED 只表示推送完成，status --remote 读到对应 release-marker 才核实为 DEPLOYED。未配置目标时显示跳过，不会把本地包称为上线。

## 影响与取消

选择文章即选择公开其引用的内容与资源。未选草稿不公开，未选已发布文章保持旧快照。

## 常见问题

UNKNOWN 先查询实际目标；PARTIAL_OR_FAILED 的回执会列出每个钩子的结果，成功目标保留。含 Pages 的失败修复后使用 `push <release-id>` 重试冻结包，若曾指定一次性目标则带回同一个 `--pages-remote`；服务器单目标使用 `publish --resume <release-id>`。不重新选择新修订。[Pages 接入与重试](/setup/github-pages) · [排障](/troubleshooting/errors)。

## 参数方式

本页步骤旁已给出对应写法与结果说明。完整参数可在[命令索引](/reference/commands)按操作名查看；示例占位符请换成实际值，已安装简短命令时可把 `npm run blog --` 换成 `blog`。
