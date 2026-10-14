---
title: meta 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# meta 命令

选择文章，查看或修改元数据。[按步骤完成这项操作 →](/writing/edit-meta)

## 使用方式

`blog meta [options] [article]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--init` | 补齐手写文章的 ID 与创建时间；未填写类型时可选择普通／诗歌 |
| `--set <字段=YAML值>` | 可重复使用 |
| `--title <标题>` | 修改标题 |
| `--slug <slug>` | 修改从未发布文章的 slug |
| `--type <类型>` | 切换文章类型：article 普通 Markdown / poem 诗歌 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog meta <文章>
blog meta <文章> --type poem --dry-run
blog meta <文章> --set 'tags=[日常,记录]' --dry-run
blog meta <文章目录> --init --type poem --yes
```

## 输入与执行边界

只修改选中字段，保留 YAML 注释与正文。菜单和 --type article/poem 可切换文体；--set type=null 恢复旧文章的缺省普通排版。诗歌与 flow 不能同时启用，可同时 --set flow=null。--init 补身份，在终端为未写 type 的手写文章提供选择，已有类型保留；--set 值采用 YAML，可重复。曾发布 slug 不可改。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
