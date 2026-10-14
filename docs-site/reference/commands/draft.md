---
title: draft 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# draft 命令

主动全量留存稿件、查看差异、直接回档与撤销。[按步骤完成这项操作 →](/writing/drafts)

## 使用方式

`blog draft [options] [command]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 子命令

### save

`blog draft save [options] [article]`

独立全量保存原文与本地资源；缺失资源时拒绝，可写备注

| 参数 | 含义 |
| --- | --- |
| `--note <备注>` | 稿件阶段或修改原因，最多 1000 字符 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### list

`blog draft list [options] [article]`

只读列出全部或某篇文章的稿件历史与实际目录

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### show

`blog draft show [options] [稿件ID]`

只读显示一份稿件的原始 Markdown

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### diff

`blog draft diff [options] [旧稿件ID] [新稿件ID]`

对比两份稿件；省略新稿件时对比当前稿

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### export

`blog draft export [options] [稿件ID]`

将旧稿与素材导出到独立新目录，不覆盖当前稿

| 参数 | 含义 |
| --- | --- |
| `--destination <新目录>` | 尚不存在的独立目录，保留原文与素材路径 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### restore

`blog draft restore [options] [稿件ID]`

备份当前文件后，直接恢复指定稿件的正文与资源

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### undo

`blog draft undo [options] [回档记录ID]`

撤销一次回档；回档后有额外编辑时拒绝覆盖

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### migrate

`blog draft migrate [options] [article]`

把完整的旧对象式稿件转为独立全量目录，保留 ID 与原记录

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

## 示例

```sh
blog draft save <文章> --note "初稿" --dry-run
blog draft save <文章> --note "重写了结尾" --yes
blog draft list <文章> --json
blog draft restore <稿件ID> --dry-run
blog draft restore <稿件ID> --yes
blog draft undo <回档记录ID> --yes
blog draft diff <旧稿件ID> <新稿件ID>
blog draft export <稿件ID> --destination ./draft-review/first --yes
blog draft migrate <文章> --dry-run
```

## 输入与执行边界

save 只在主动调用时独立全量复制一稿，保存原文、备注和完整本地素材；正文与排版参数可未完成，但缺失资源和远端媒体会拒绝，不绑定编辑、格式化或发布。新式文章保存整个本篇目录，旧文章复制引用的共享素材；每稿在 .blog-store/drafts/versions/<文章ID>/<稿件ID>，可直接打开或独立备份。restore 先持久备份当前实际文件，再直接恢复正文与资源；undo 撤销回档，额外编辑时拒绝覆盖。写入失败回滚，中断后重试先恢复；dry-run 不恢复事务。list/show/diff 只读，export 只写独立新目录；migrate 保留 ID、时间、备注与旧记录，仅转换资源齐全的旧稿。全部操作不自动上传、不改公开集合，也不纳入现有 sync。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
