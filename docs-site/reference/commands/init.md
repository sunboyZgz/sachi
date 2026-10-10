---
title: init 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# init 命令

配置向导；不建立根项目 Git 仓库或连接服务器。[按步骤完成这项操作 →](/start/configure)

## 使用方式

`blog init [options]`

简短入口先按[命令安装](/start/install)注册；未安装时将 blog 换成 `npm run blog --`。尖括号为占位符，不能原样执行。

## 参数

| 参数 | 含义 |
| --- | --- |
| `--timezone <时区>` | IANA 时区 |
| `--git-remote <地址>` | 独立内容 Git 仓库 |
| `--visibility <可见性>` | 按仓库实际设置确认 |
| `--pages` | 启用 GitHub Pages；目标默认读取根仓库 origin |
| `--pages-remote <地址>` | 保存 GitHub Pages 目标仓库地址 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |
| `-h, --help` | 显示帮助，不执行 |

## 示例

```sh
blog init
blog init --timezone Asia/Shanghai --dry-run
```

## 输入与执行边界

配置向导不创建远端或连接服务器。--yes 的无参数调用保留现有配置，仅创建缺失目录和模板。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
