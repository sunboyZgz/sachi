---
title: search 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# search 命令

根据中文标题或关键词查找本地文章 ID。[按步骤完成这项操作 →](/writing/find)

## 使用方式

`blog search [options] [关键词]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog search "朝思暮想"
blog search "博客 玩具"
blog search "朝思暮想" --json
```

## 输入与执行边界

只读取本地正式文章的名称和身份，不检查未完成正文或缺失图片，也不查询服务器。中文关键词和轻微错字使用 Fuse.js 匹配；多个空格分隔的关键词必须全部匹配。输出所有候选及 ID，不自动选择或修改文章。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
