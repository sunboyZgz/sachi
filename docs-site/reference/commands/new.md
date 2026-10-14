---
title: new 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# new 命令

选择栏目、文章类型，再输入标题。[按步骤完成这项操作 →](/writing/new)

## 使用方式

`blog new [options]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--category <栏目>` | 闲暇娱乐 / 生活旁白 / 蘸豆！！，或 play/life/learn |
| `--title <标题>` | 文章标题 |
| `--slug <slug>` | 可选固定 URL；默认使用 UUID |
| `--type <类型>` | article 普通 Markdown / poem 诗歌；未指定时使用模板或普通文章 |
| `--series <系列>` | 所属系列 ID 或 slug |
| `--order <序号>` | 章节正整数序号；缺省建议最大值 + 1 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog new
blog new --category life --title "秋天的一杯茶" --type article --dry-run
blog new --category life --title "寄给春天的信" --type poem
```

## 输入与执行边界

交互式依次选择栏目、普通／诗歌类型和标题。--type article/poem 可直接指定；脚本未指定时沿用 post.md 模板类型或普通文章。诗歌使用 templates/poem.md，缺失时使用内置逐行模板。--yes 不填写必要输入，--json／非终端必须明确提供栏目和标题。slug 默认生成 UUID。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
