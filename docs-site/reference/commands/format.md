---
title: format 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# format 命令

为选中文章正文补中英文空格；先看差异，再确认写入。[按步骤完成这项操作 →](/writing/format)

## 使用方式

`blog format [options] [articles...]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--ignore <词语>` | 保留词语原写法，可重复；默认保留 A股/B股/H股/A站/B站 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog format <文章> --dry-run
blog format <文章> --yes
blog format <文章A> <文章B> --ignore "维生素B12" --dry-run --json
```

## 输入与执行边界

只给明确选中文章的正文补中英文空格；支持强调和链接文字，保护代码、公式、自动网址、图片、引用定义、链接目标与 frontmatter。保留原换行、注释和行尾空格；默认保留 A股/B股/H股/A站/B站，--ignore 可重复。先展示逐行差异，确认后事务写入；--dry-run 不写入或恢复，不绑定构建发布，无需修改时返回 UNCHANGED。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
