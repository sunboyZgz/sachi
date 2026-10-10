---
title: recover 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# recover 命令

从服务器恢复当前公开快照。[按步骤完成这项操作 →](/backup/recover)

## 使用方式

`blog recover [options]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--destination <新目录>` | 恢复目标 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog recover --destination <新目录> --dry-run
blog recover --destination <新目录> --yes
```

## 输入与执行边界

仅从 deploy 服务器当前公开包下载并校验，不支持 Pages-only。原稿恢复到尚不存在的新目录，代码与文章快照补齐到本项目持久存储，不覆盖 src 或当前原稿。未公开草稿无法恢复。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
