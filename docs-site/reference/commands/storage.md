---
title: storage 命令
scope: reference
---

<!-- 由 tools/docs/reference.ts 与实际 Commander 定义生成；修改后运行 docs:generate。 -->

# storage 命令

Yandu 初始化、私有同步、资源上传与恢复。[按步骤完成这项操作 →](/setup/yandu)

## 使用方式

`blog storage [options] [command]`

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

### init

`blog storage init [options]`

重复初始化并校验项目逻辑目录

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### status

`blog storage status [options]`

查看本地修改与最近持久保存状态

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### sync

`blog storage sync [options]`

校验并持久保存全部私有写作资料，不上线

| 参数 | 含义 |
| --- | --- |
| `--resolve <检查点>` | 明确将这些冲突头合并为当前工作副本；重复指定全部冲突头 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### list

`blog storage list [options]`

列出可恢复的私有检查点

| 参数 | 含义 |
| --- | --- |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### restore

`blog storage restore [options] [检查点]`

从 Yandu 恢复到尚不存在的新目录

| 参数 | 含义 |
| --- | --- |
| `--destination <新目录>` | 尚不存在的恢复目录 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### avatar

`blog storage avatar [options] [用途]`

上传并校验头部或半身头像，再关联个人资料

| 参数 | 含义 |
| --- | --- |
| `--file <图片路径>` | 本地头像原件 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

### upload

`blog storage upload [options] [类别] [所属ID]`

按文章或作品 ID 保存资源，默认私有

| 参数 | 含义 |
| --- | --- |
| `--file <文件路径>` | 本地原件 |
| `--root <目录>` | 项目目录 |
| `--json` | 机器可读结果，禁用交互 |
| `--yes` | 跳过执行确认，不跳过输入和校验 |
| `--dry-run` | 只查看计划，不写入或部署 |

## 示例

```sh
blog storage init --yes
blog storage status
blog storage sync --dry-run
blog storage sync --yes
blog storage sync --resolve <分支A> --resolve <分支B> --yes
blog storage list
blog storage restore <检查点> --destination ../sachi-recovery --yes
blog storage avatar head --file ./head.png --yes
blog storage upload article <文章ID> --file ./video.mp4 --yes
```

## 输入与执行边界

凭证优先从私密 JSON 文件读取，仅文件不存在时使用环境变量保底；init 建立可重试目录绑定，sync 全量保存原稿、稿件与关联资料，READY 并回读摘要后才记录 saved。断网本地继续编辑，恢复后重试；云端基线冲突需恢复到新目录核对。avatar 先保留原件与旧资料，再关联个人配置。upload 本身不开放匿名读取。restore 只写新目录并验证所有文件。

--yes 只跳过执行确认，不跳过输入、内容校验或并发检查。--json 禁用问答；要获得无 npm 前缀的 JSON，用 `npm run --silent blog -- <命令> --json`。

[状态与退出码](/troubleshooting/errors) · [全部命令](/reference/commands)
