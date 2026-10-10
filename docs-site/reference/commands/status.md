---
title: status 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# status 命令

查看文章与备份状态。[按步骤完成这项操作 →](/preview/status)

## 使用方式

`blog status [options]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--remote` | 只读核实服务器当前清单 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog status --remote
blog status --remote --dry-run --json
```

## 输入与执行边界

服务器 current 或匹配的 Pages 标记才核实公开状态；普通远端查询可保存已核实清单，--dry-run 不保存。双目标时文章列表依服务器，Pages 单独展示；未配置目标时 --remote 也无法证明上线。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
