---
title: 核实发布历史
scope: read
files: 不修改正文
network: 选择远端历史时需要
online: 不改变
---

# 核实发布历史

## 什么时候用

需要找出当前与历史成功版本，或区分失败、仅构建和已上线记录时使用。本地记录与服务器记录要分别核实。

## 开始前

区分本地执行记录与服务器发布历史。查询远端需要对应的 deploy 或 pages 配置。

## 操作步骤

1. 进入“查看发布历史 · history”。

2. 有部署或 Pages 配置时选择本地记录或只读远端查询。

3. 查看 releaseId、状态、时间、上一个版本与操作类型。

4. 本地 BUILD_ONLY 只是构建，UNKNOWN 是待核实，不把它们当成功上线。

5. 回滚前依据服务器成功发布记录选择版本，不凭文件名猜测。

### 本地、服务器、Pages 各自提供什么

| 来源 | 能看到什么 | 不能据此推断什么 |
| --- | --- | --- |
| `history` 本地 receipts | 本机已保存的构建、交付、失败和回滚记录 | 不能证明网络中断后实际站点状态 |
| `history --remote` 的 server | 部署器保存的远端发布 / 回滚记录 | 不会恢复本地全部工作草稿 |
| `history --remote` 的 pages | Pages 当前核实结果 | 不是完整的 GitHub Actions 历史查询 |

Pages 的历史作业与失败日志在回执给出的仓库 Actions 页面查看。未配置的目标显示 SKIPPED，顶层 VERIFIED 表示完成了查询，不表示每条历史记录都已成功部署。

### 挑选版本时核对这些信息

使用完整 releaseId，不把显示时间当 ID。核对该记录是 build、publish 还是 rollback，以及 `hooks.server` / `hooks.pages` 的单独状态。回滚操作有自己的记录 ID，目标网站版本另有 releaseId；不要混用“操作记录”与“被恢复版本”。

BUILD_ONLY 不在线，PUSHED 仍需核实 Pages，PARTIAL_OR_FAILED 可能只有一端成功；需要当前事实时配合 `status --remote`，而不是只找最后一个本地文件。

## 确认结果

本地返回 CACHED，服务器查询返回 VERIFIED。发布和回滚记录可以区分。

## 影响与取消

只读取历史，不改变服务器 current 或本地正文。

## 常见问题

本地记录不等于线上事实；记录为空可能从未实际执行，或者在另一设备执行。

## 参数方式

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog -- history
npm run blog -- history --remote
```
