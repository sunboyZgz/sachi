---
title: Yandu 与服务器配置参数
scope: reference
---

# Yandu 与服务器配置参数

日常使用先读[接入流程](/setup/yandu)，需要创建密钥时读[凭证与权限](/setup/yandu-credentials)。本页用于逐项对照配置；示例中的项目、域名、路径都要换成自己的值。

## 先确定改哪份文件

| 文件 | 放在哪里 | 管什么 | 是否含秘密 |
| --- | --- | --- | --- |
| `blog.config.json` | 本机 Sachi 根目录 | 域名、时区、部署目标、Yandu 项目绑定与凭证路径 | 不填写密钥 |
| `.sachi/yandu-upload.json` | 本机，默认私密路径 | 本地上传和私有恢复凭证 | 是，不提交、不备份到写作仓库 |
| `/etc/sachi/resource-proxy.json` | 云服务器 | 代理端口、部署根、上游网关和只读凭证 | 是，不进入静态站点 |
| `~/.ssh/config` | 执行发布的本机 | SSH 地址、用户、端口和私钥位置 | 不复制到服务器静态目录 |
| Nginx 站点配置及 systemd 单元 | 云服务器 | HTTPS、静态目录和代理进程 | TLS 私钥单独存放 |
| `docs-site/docs.config.json` | 本机 Sachi 项目 | 手册网站自身的部署子路径 | 否，与博客域名独立 |

本地上传配置和云端只读配置使用两枚不同凭证，绑定同一个项目 ID。`schemaVersion` 只是配置格式版本，不是 SDK 版本，也不是资源版本。

## 本机 blog.config.json

下面是可以解析的最小 SSH＋Yandu 配置；合并到现有文件时保留媒体、Git 等已有设置，不整份覆盖。示例 `sachi` 只是项目 ID 占位值；已有专用项目若叫 `blog`，两端都填写 `blog`。

```json
{
  "schemaVersion": 1,
  "timezone": "Asia/Shanghai",
  "contentDir": ".blog-store/content",
  "siteUrl": "https://blog.example.com",
  "codeRef": null,
  "git": null,
  "pages": null,
  "deploy": {
    "type": "ssh",
    "host": "sachi-server",
    "root": "/srv/sachi-blog"
  },
  "yandu": {
    "gateway": "http://127.0.0.1:18770",
    "projectId": "sachi",
    "credentialFile": ".sachi/yandu-upload.json",
    "credentialEnv": "YANDU_UPLOAD_KEY"
  }
}
```

| 字段 | 类型 / 默认 | 填写规则与用途 |
| --- | --- | --- |
| `schemaVersion` | 数字，必填 `1` | 保持数字，不写成字符串 |
| `timezone` | 字符串，必填 | IANA 时区，如 `Asia/Shanghai`；目录日期和发布时间按它解释 |
| `contentDir` | 字符串，默认 `.blog-store/content` | 只允许该值或旧值 `content`；不是 Yandu 物理存储路径 |
| `siteUrl` | URL 或 `null`，默认 `null` | SSH 部署必填正式地址；不带账号、查询参数或片段；子路径需同步配静态服务 |
| `codeRef` | Git 引用或 `null`，默认 `null` | `null` 冻结当前代码；不要为了使用 Yandu 填一个不存在的分支 |
| `deploy.type` | `ssh` 或 `local` | 云端用 `ssh`；`local` 仅作本机部署验收 |
| `deploy.host` | 字符串，SSH 时必填 | 本机 SSH 别名；允许字母、数字、下划线、点、短横线，最长 128 字符；不填整段 SSH 命令 |
| `deploy.root` | 绝对目录，必填 | 云端专用发布根，如 `/srv/sachi-blog`；不能用根目录、主目录或本机项目；SSH 路径仅用字母、数字、下划线、斜线和短横线 |
| `yandu.gateway` | 网关根 URL，绑定时必填 | 本机 CLI 能访问的业务接口；HTTP/HTTPS，不附 `/storage/v1`，不带账号、密钥、查询或片段 |
| `yandu.projectId` | 字符串，绑定时必填 | Yandu 已创建的项目 ID，不是项目目录名；字母或数字开头，其余允许字母、数字、点、下划线、短横线，最长 128 字符 |
| `yandu.credentialFile` | 字符串，默认 `.sachi/yandu-upload.json` | 相对 Sachi 根目录解析；项目内只能放 `.sachi/`，也可指向项目外私密文件；不接受符号链接文件 |
| `yandu.credentialEnv` | 字符串，默认 `YANDU_UPLOAD_KEY` | 仅凭证文件不存在时使用的变量名；不填密钥，不使用 `NEXT_PUBLIC_` 或系统变量名 |
| `git` / `pages` / `deploy` / `yandu` | 对象或 `null` | `null` 停用对应接入；Yandu 公开资源需要同站代理，不能同时启用 Pages |

Git、Pages 和媒体的其余参数分别见[Git](/setup/git)、[Pages](/setup/github-pages)、[媒体配置](/setup/media)。配置向导入口为 `npm run blog -- init`，保存参数不会立即联网、上传或发布。

## 本机私密上传配置

```json
{
  "schemaVersion": 1,
  "uploadKey": "替换为本地 read-upload-metadata 凭证原文"
}
```

| 字段 | 要求 | 取值来源 |
| --- | --- | --- |
| `schemaVersion` | 数字 `1`，必填 | 固定值 |
| `uploadKey` | 非空字符串，最长 16384 字符，不含空白或控制字符 | Yandu「通用应用存储 → 选中项目 → 凭证」创建后显示一次的原文 |

不增加未知字段。JSON 不支持注释和尾逗号。目录权限建议 0700、文件 0600；空白模板尚未填入密钥时，连接会报错。重开 CLI 后读取新文件，不需要重启博客开发预览。

## 云端资源代理配置

模板在仓库 `deploy/resource-proxy.config.example.json`。服务器保存为 `/etc/sachi/resource-proxy.json`：

```json
{
  "schemaVersion": 1,
  "deployRoot": "/srv/sachi-blog",
  "gateway": "http://127.0.0.1:19091",
  "projectId": "sachi",
  "readKey": "替换为另一枚只读凭证原文",
  "port": 19092
}
```

| 字段 / 启动项 | 类型 / 默认 | 填写规则与影响 |
| --- | --- | --- |
| `schemaVersion` | 数字，必填 `1` | 固定配置格式 |
| `deployRoot` | 字符串，必填 | 云端专用绝对目录，与 `deploy.root` 相同；代理读取其 `current` 对应清单，不可填 `current` 自身 |
| `gateway` | 字符串，默认 `http://127.0.0.1:19091` | 从云端代理进程看见的业务网关；不填本机电脑的 18770，不填隧道控制端口；Docker 内需用实际可达地址 |
| `projectId` | 字符串，必填 | 与本机绑定完全一致；规则同 `yandu.projectId` |
| `readKey` | 非空字符串，必填 | 独立 `read` 凭证，不使用上传密钥；不含空白或控制字符 |
| `port` | JSON 数字，默认 `19092` | 1–65535；代理固定绑定 `127.0.0.1`，Nginx `proxy_pass` 同步使用该端口 |
| `--config <路径>` | 命令行参数，默认上述 `/etc` 路径 | 只选择 JSON 文件位置；例：`node server.mjs --config /etc/sachi/resource-proxy.json` |

除了上述六个 JSON 字段，不接受其他字段。文件必须是普通文件，最大 64 KiB。`gateway` 和 `port` 省略时使用程序默认值，不使用环境变量补齐。更改文件后重启 `sachi-resource-proxy`。按[服务器步骤](/setup/server)将配置目录设为 root:sachi-resource、0750，文件为 root:sachi-resource、0640，服务用户必须能读取。

## 文件与环境变量的优先级

| 情况 | 行为 |
| --- | --- |
| 指定文件存在且有效，同时设置环境变量 | 只使用文件 |
| 指定文件不存在 | 才允许读取对应环境变量 |
| 文件存在但空白、缺字段、格式错误、非普通文件或无法读取 | 报错，不回退，不补齐 |
| 文件不存在且保底值也不完整 | 报错；本地写作仍可继续 |

| 文件不存在时 | 兼容变量 | 对应字段 |
| --- | --- | --- |
| 本机 `credentialFile` 不存在 | `credentialEnv` 指定的变量，默认 `YANDU_UPLOAD_KEY` | `uploadKey` |
| 云端 JSON 不存在 | `SACHI_DEPLOY_ROOT` | `deployRoot` |
| 云端 JSON 不存在 | `YANDU_GATEWAY` | `gateway` |
| 云端 JSON 不存在 | `YANDU_PROJECT_ID` | `projectId` |
| 云端 JSON 不存在 | `YANDU_READ_KEY` | `readKey` |
| 云端 JSON 不存在 | `SACHI_RESOURCE_PORT` | `port` |

本机旧 `.env.yandu.local` 需要调用方显式载入；云端 systemd 单元兼容可选 `/etc/sachi/resource-proxy.env`。正常配置使用 JSON 即可。`BLOG_*` 等由 Sachi 构建器生成的子进程变量不是需要用户手填的连接参数。

## 地址、端口和 HTTPS 怎么对应

```text
写作电脑：Sachi CLI ──18770──> 本机 Yandu 文件服务
                              ↑
访客 ──443──> 云端 Nginx ──19092──> Sachi 资源代理
                                  │ 只读凭证
                                  └─19091 网关 → 隧道 → 本机文件服务
```

| 示例端口 | 角色 | 谁使用 |
| --- | --- | --- |
| `18765` | 本机 Yandu 管理页 | 作者管理项目和凭证；不是 SDK basePath |
| `18770` | 本机 Yandu 文件业务 API | 本地 CLI / SDK |
| `7000` | 隧道连接入口 | Yandu 本机端和云端隧道；不是下载 URL |
| `19090` | 当前已配对隧道的云端回环转发口 | 由 Yandu 网关上游使用，需核实实际配置 |
| `19091` | 云端业务网关默认值 | Sachi 资源代理的 `gateway` |
| `19092` | Sachi 资源代理默认值 | Nginx 的 `proxy_pass` |
| `443` | 博客 HTTPS 公开入口 | 访客 |

这些是已知默认值与已记录的本机实例值，不代表生产监听已经核验。容器内 `127.0.0.1` 指容器自己；不要照抄宿主机地址。运行模式和端口应先在 Yandu 部署侧确认。

SSH 的 `HostName`、`User`、`Port`、`IdentityFile` 放在本机 `~/.ssh/config`，`deploy.host` 只引用 `Host` 别名。Nginx 模板中的 `server_name` 填正式域名，`ssl_certificate` 指证书链，`ssl_certificate_key` 指服务器 TLS 私钥，`root` 指 `deploy.root/current`。更改部署根还要同步 systemd 的 `ReadOnlyPaths`。Yandu 网关、代理端口和物理存储路径都不出现在浏览器资源 URL 中。

## 资源引用字段不是连接配置

| 字段 | 含义 |
| --- | --- |
| `projectId` / `objectId` / `versionId` | 固定项目、对象和原件版本；不可仅凭对象 ID 读取“最新版”代替 |
| `sha256` / `bytes` / `mime` | 核验摘要、字节数和媒体类型 |
| `width` / `height` / `duration` | 图片或视频元数据；尺寸以像素、时长以秒记录 |
| `/resources/<sha256>/<objectId>/<versionId>` | Sachi 公开候选路径；只有当前发布清单明确授权才可匿名读取 |

这些字段由上传、校验和冻结流程生成，不手动改 ID 或 SHA256 来“修复”资源。目录 ID、结构版本及上传进度在 `.blog-store/yandu/`，由 Sachi 管理，不填进服务器配置。命令行的 `--file`、`--destination`、`--resolve` 等完整说明见[storage 参数](/reference/commands/storage)。

## 如何核对填得对不对

先运行 `npm run blog -- doctor --remote` 检查已配置接入，再运行 `storage init --dry-run` 看计划、`storage init --yes` 创建或复用目录。`storage status` 仅报告本地保存状态，不能证明网关、凭证或 HTTPS 正常。云端先检查服务日志，再用已发布资源的 HTTPS URL 验证 HEAD、Range 和条件请求；未知 URL 返回 404 是正常授权拒绝。

如果出现 `401`，核对项目、凭证和撤销状态；`403` 核对操作权限；`409` 核对同名目录、版本或检查点分支；`507` 核对已用、预留和配额。代理面向访客会隐藏内部细节，网关或凭证故障通常显示为 503，应从服务端排查，不能仅凭访客状态码判断上游原因。
