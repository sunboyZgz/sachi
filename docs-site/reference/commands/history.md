---
title: history 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# history 命令

查看发布记录。[按步骤完成这项操作 →](/release/history)

## 使用方式

`blog history [options]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--remote` | 核实服务器记录 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog history
blog history --remote
```

## 输入与执行边界

默认是本地执行记录；--remote 的 server 查询部署记录，pages 仅查询当前核实状态，不是完整 Actions 历史。未配置的目标显示 SKIPPED；BUILD_ONLY 和 PUSHED 都不能单独证明上线。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
