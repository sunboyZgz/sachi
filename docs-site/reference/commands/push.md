---
title: push 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# push 命令

推送冻结发布包；执行已配置的服务器与 Pages 两个钩子。[按步骤完成这项操作 →](/setup/github-pages)

## 使用方式

`blog push [options] [release-id]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--pages-remote <地址>` | 本次覆盖 blog 分支目标；默认读取 pages.remote 或 origin |
| `--setup-pages` | 显式启用 GitHub Actions Pages 发布源 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog push
blog push <release-id> --dry-run
blog push <release-id> --setup-pages --yes
blog push <release-id> --pages-remote git@github.com:OWNER/REPO.git --dry-run
```

## 输入与执行边界

只推送明确选中的完整冻结包，不读取工作草稿，不提交或推送 main。调用 push 会启用 Pages 目标解析；目标依次取本次 --pages-remote、pages.remote、根 origin 的 push URL。服务器未配置则跳过；服务器单目标继续原计划应使用 publish --resume，不把 push 当服务器别名。一次性覆盖不保存给后续 status。PUSHED 是 Actions 排队，不等于已上线。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
