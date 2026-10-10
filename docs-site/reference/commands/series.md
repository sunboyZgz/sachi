---
title: series 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# series 命令

新建、列出或修改系列资料。[按步骤完成这项操作 →](/writing/series)

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

创建系列

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

## 示例

```sh
blog series new --category learn --title "学习札记" --slug learning-notes
blog series list --json
blog series meta <系列> --set 'description=按顺序留下学习记录。'
```

## 输入与执行边界

子命令 new/list/meta 管理系列资料；章节发布时自动冻结所属系列最新资料，--series 可单独更新介绍。ID 稳定，已发布 slug 不能修改。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
