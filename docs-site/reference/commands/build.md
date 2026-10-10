---
title: build 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# build 命令

选择文章生成发布包，不上线。[按步骤完成这项操作 →](/release/build)

## 使用方式

`blog build [options] [articles...]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--export` | 导出到 out/；保留旧目录备份 |
| `--accept-baseline` | 接受全站代码/配置基线变更 |
| `--series <系列>` | 明确更新系列资料，可重复 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog build <文章> --dry-run
blog build <文章> --yes --export
```

## 输入与执行边界

必须明确选择正式文章，生成 BUILD_ONLY 包而不是上线。--export 将旧 out 保留为备份；不做 Git 上传。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
