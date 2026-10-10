---
title: publish 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# publish 命令

明确选择文章并发布，或恢复冻结计划。[按步骤完成这项操作 →](/release/publish)

## 使用方式

`blog publish [options] [articles...]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--series <系列>` | 明确更新系列资料，可重复 |
| `--resume <release-id>` | 恢复原计划，不读取新修订 |
| `--accept-baseline` | 接受全站代码/配置基线变更 |
| `--pages-remote <地址>` | 本次覆盖 blog 分支目标，不更改 origin 或永久配置 |
| `--setup-pages` | 显式启用目标仓库的 GitHub Actions Pages 发布源 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog publish <文章> --dry-run
blog publish <文章> --yes
blog publish --resume <release-id> --yes
```

## 输入与执行边界

候选集合是旧成功清单加明确冻结修订。--resume 不能同时选择新文章。参数方式接受基线需 --accept-baseline。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
