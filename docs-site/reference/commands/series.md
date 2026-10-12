---
title: series 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# series 命令

查找、创建系列，或按 ID 插入章节。[按步骤完成这项操作 →](/writing/series)

## 使用方式

`blog series [options] [command]`

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

### new

`blog series new [options]`

创建系列并输出 ID

| 参数 | 含义 |
| --- | --- |
| `--category <栏目>` | 所属栏目 |
| `--title <名称>` | 系列名称 |
| `--slug <slug>` | 固定 URL |
| `--description <简介>` | 可选纯文字简介 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### list

`blog series list [options]`

列出本地系列

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### meta

`blog series meta [options] [series]`

查看或修改系列

| 参数 | 含义 |
| --- | --- |
| `--set <字段=YAML值>` | 修改资料，可重复 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### search

`blog series search [options] [关键词]`

根据中文名称或关键词查找系列 ID

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### add

`blog series add [options] [文章ID]`

按文章和系列完整 ID 插入章节，后续序号加一

| 参数 | 含义 |
| --- | --- |
| `--series <系列ID>` | 完整系列 UUID |
| `--order <序号>` | 插入章节的正整数序号；后续章节统一加一 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

## 示例

```sh
blog series search "我学会了"
blog series new --category play --title "我学会了"
blog series add <文章ID> --series <系列ID> --order 2 --dry-run
blog series list --json
blog series meta <系列> --set 'description=按顺序留下学习记录。'
```

## 输入与执行边界

search 按中文名称列出候选 ID；new 创建后输出 ID。add 只接受完整文章 ID 和系列 UUID，拒绝已经归组的文章，将序号不小于插入点的所有本地章节加一；修改采用可恢复事务，不自动上线。new/list/meta 保持原用法；章节发布时冻结所属系列资料。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
