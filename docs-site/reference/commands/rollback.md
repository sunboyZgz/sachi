---
title: rollback 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# rollback 命令

选择版本整站回滚，不覆盖本地写作。[按步骤完成这项操作 →](/release/rollback)

## 使用方式

`blog rollback [options]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--to <release-id>` | 目标版本 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog rollback --to <release-id> --dry-run
blog rollback --to <release-id> --yes
```

## 输入与执行边界

仅支持服务器单目标；启用 Pages 时明确拒绝，不自动只回滚其中一端。整站切换到历史成功版本，原稿不覆盖；核对恢复和移除的全部条目。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
