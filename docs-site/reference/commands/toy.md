---
title: toy 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# toy 命令

准备本地作品资料；待媒体处理，不上传或公开。[按步骤完成这项操作 →](/writing/toys)

## 使用方式

`blog toy [options] [command]`

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

### add

`blog toy add [options]`

逐项或从 YAML 录入作品，保存为待媒体处理

| 参数 | 含义 |
| --- | --- |
| `--file <YAML文件>` | 已填写的作品文件；媒体相对路径以此文件目录为准 |
| `--video-overflow <策略>` | 未来处理超限视频：reject 拒绝；trim-start 保留开头 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### template

`blog toy template [options]`

生成填写模板，不覆盖文件、不生成作品 ID

| 参数 | 含义 |
| --- | --- |
| `--output <YAML路径>` | 写入尚不存在的填写模板 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### list

`blog toy list [options]`

只读列出作品 ID、路径与待处理状态

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### check

`blog toy check [options] [作品ID]`

只读重新检查作品资料、原媒体变化和公网地址

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

## 示例

```sh
blog toy add
blog toy template --output ./toy.yaml
blog toy add --file ./toy.yaml --dry-run
blog toy add --file ./toy.yaml --yes
blog toy check <作品ID>
blog toy list --json
```

## 输入与执行边界

add 逐项引导或从 --file YAML 录入，必填名称、简介、本地封面、本地视频、公网地址及未来超限策略。媒体须可解码，项目地址须能匿名访问。保存原文件引用和摘要，状态固定为待媒体处理；不上传、不压缩、不裁剪，不进入舞台或公开集合。template 不生成作品 ID，不覆盖目标。list/check 只读，check 发现源文件变化则拒绝并保留原登记摘要。--video-overflow 可覆盖文件策略；--yes 不隐含裁剪授权。Yandu 通用能力验收见 /reference/yandu-acceptance。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
