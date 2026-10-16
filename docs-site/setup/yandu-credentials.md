---
title: 创建、保存与轮换 Yandu 凭证
scope: config
files: 两端私密 JSON；不改写文章
network: 创建与核验需要 Yandu 管理页和业务网关
online: 新建凭证不发布；撤销在用读取凭证会影响公开媒体
---

# 创建、保存与轮换 Yandu 凭证

## 什么时候用

首次接入、遗失密钥、换电脑、部署代理或轮换密钥时使用。这里的“项目凭证”是访问文件的密钥；软件“许可证”是代码使用条款，HTTPS“证书”用于浏览器验证网站身份，三者用途不同。

| 名称 | 从哪里来 | 放在哪里 | 谁用 |
| --- | --- | --- | --- |
| Yandu 本地上传凭证 | 专用项目的「凭证」页 | 本机 `.sachi/yandu-upload.json` 的 `uploadKey` | CLI、私有同步与恢复 |
| Yandu 云端读取凭证 | 同一项目另建一枚 | 云端 `/etc/sachi/resource-proxy.json` 的 `readKey` | Sachi 资源代理 |
| Yandu 管理会话 | Yandu 本机管理入口 | Yandu 自己管理 | 作者创建项目和凭证；不填入 Sachi |
| SSH 登录密钥 | 服务器现有 SSH 登录配置 | 本机私钥文件，由 `~/.ssh/config` 引用 | Sachi 发布器 |
| HTTPS 证书及私钥 | 服务器现有证书签发与续期方案 | 云端，由 Nginx 配置引用 | 浏览器与 Nginx |
| 隧道配对凭据 | Yandu 配对流程 | Yandu 自己的私密配置 | 隧道两端，不作为项目密钥 |
| SDK 的 MIT 许可证 | SDK 对应源版本的 `LICENSE` | 随代码分发保留原文 | 说明软件许可，不用于认证 |

## 开始前

在 Yandu 创建或确认专用 `application_storage` 项目、物理存储位置和配额，记下项目 ID。Sachi 不接管物理目录、不替你创建项目凭证。两枚凭证必须属于同一项目；创建后原文只显示一次，Yandu 保存摘要，无法重新显示旧原文。

SDK、凭证及匿名授权是三层：SDK 发请求，凭证决定这个项目允许什么操作，Sachi 当前发布清单决定访客可以看哪些具体版本。云端 `read` 凭证本身有整个项目的读取能力，因此必须只留在代理进程，由代理逐请求限制公开范围。

## 操作步骤

1. 打开当前正在运行的 Yandu 管理页。开发实例可在 **Yandu 项目目录**运行以下命令；`state-dir` 须与当前实例一致，生产安装按其现有启动方式打开：

   ```sh
   .local/bin/yandu --state-dir "$PWD/.yandu-storage-dev" ui --require-running
   ```

   进入「通用应用存储」，顶部选中专用项目，再打开「凭证」。不要通过浏览器控制台、数据库或聊天导出密钥。

2. 创建本地凭证：勾选「读取」「上传」「目录与名称」，不额外勾选删除、恢复或媒体处理。创建后复制原文，填入本机私密配置，保存后在页面点「隐藏」。

   ```json
   {
     "schemaVersion": 1,
     "uploadKey": "粘贴本地凭证原文"
   }
   ```

   默认路径 `.sachi/yandu-upload.json`，连接位置由 `blog.config.json.yandu.credentialFile` 指定。用编辑器填写，不把密钥放进命令行参数或 shell 历史。限制权限：

   ```sh
   chmod 700 .sachi
   chmod 600 .sachi/yandu-upload.json
   ```

3. 另建云端读取凭证：只勾选「读取」，取消管理页默认勾选的「上传」。复制到云端私密 JSON 的 `readKey`，其余参数见[配置字段表](/reference/yandu-config)。文件 root:sachi-resource、0640，目录 root:sachi-resource、0750；由服务用户读取。不要把本地上传配置复制到服务器。

   ```json
   {
     "schemaVersion": 1,
     "deployRoot": "/srv/sachi-blog",
     "gateway": "http://127.0.0.1:19091",
     "projectId": "sachi",
     "readKey": "粘贴另一枚只读凭证原文",
     "port": 19092
   }
   ```

4. 使用原 CLI 入口核验连接和目录，不需要先设置环境变量。初始化只建逻辑目录；上传、预览和正式发布仍是后续不同步骤。

   ```sh
   npm run blog -- doctor --remote
   npm run blog -- storage init --dry-run
   npm run blog -- storage init --yes
   ```

   云端更改配置后执行 `sudo systemctl restart sachi-resource-proxy`，再验证一个**已发布且在清单授权内**的资源 URL。没有发布资源时，未知 URL 返回 404 不能用来确认凭证有效；先使用同一只读配置做服务端容量查询，方法见[SDK 用法](/reference/yandu-sdk)。

5. 轮换时先创建权限相同的新凭证，更新相应 JSON。CLI 新命令会重新加载；代理需要重启。验证新凭证有效、旧公开版本仍可读、上传或恢复仍成功后，在 Yandu 列表按记录的凭证 ID 撤销旧凭证。建议自行记录“凭证 ID、用途、创建日期”，不要在记录中保存原文。

   正常轮换分本地与云端分别进行；撤销前确保没有使用旧凭证的上传仍在进行。发生泄露时直接撤销受影响凭证，再建立新凭证和恢复服务，不为保持访问而延迟撤销。撤销会拒绝后续请求，并可能中断活动传输；已经下载到访客设备的文件无法收回。

### 六种权限如何选择

| 管理页选项 / scope | Yandu 允许的操作 | Sachi 本地 | Sachi 云端 |
| --- | --- | --- | --- |
| 读取 `read` | 条目、原件、版本、派生物、容量、能力、任务和操作查询 | 需要 | 需要 |
| 上传 `upload` | 上传意图、Tus 创建和续传、上传状态查询 | 需要 | 不需要 |
| 目录与名称 `metadata` | 创建目录、重命名、移动 | 初始化和按 ID 建目录需要 | 不需要 |
| 删除 `delete` | 文件或目录软删除 | 当前同步不自动删除，无需授予 | 不需要 |
| 恢复 `restore` | Yandu 回收站列表与恢复 | Sachi 检查点恢复是读取，不需此权限 | 不需要 |
| 媒体处理 `process` | 上传时指定处理预设、提交媒体处理任务 | 当前 Sachi 本地处理后上传独立产物，无需授予 | 不需要 |

“恢复私有写作资料”与“把 Yandu 回收站的文件恢复出来”是不同操作。普通 `storage restore` 下载仍存在的检查点和版本，若文件已被移入回收站，需先由 Yandu 管理端恢复。`metadata` 也允许改名和移动，因此本地凭证仍应私密保存。

## 确认结果

本地初始化成功、重复执行复用目录；云端服务能用新只读凭证读取已授权的固定版本。浏览器 URL、HTML、日志和发布包中没有项目密钥。`storage status` 是本地状态，不单独作为联网凭证验收。

## 影响与取消

创建凭证不会上传资料或公开资源。撤销上传凭证后可继续本地编辑，但保存、恢复和发布中的 Yandu 操作会失败；撤销云端读取凭证后，静态文字仍在，公开媒体读取可能返回 503。不要通过开放整个 Yandu 项目或目录绕过故障。

## 常见问题

- **把密钥填成项目 ID**：`projectId` 是如 `blog` 的标识；`uploadKey/readKey` 必须是创建后显示的原文，不是凭证 ID 或摘要。
- **看不到旧密钥**：原文只显示一次；新建并轮换，不去数据库找回。
- **文件有密钥但 403**：核对项目与 scope；缺 `metadata` 无法初始化目录，只有 `upload` 也无法回读校验。
- **环境变量正确却仍报错**：JSON 文件存在时以它为准；空模板需要填写，错误文件不会触发保底。
- **换电脑后无法连接**：恢复包不含私密凭证，凭证路径重置为新目录的 `.sachi/yandu-upload.json`；重新创建或安全配置本地凭证。
- **“许可证密钥”在哪填**：当前 SDK 使用 MIT 软件许可证，没有激活码参数；项目访问仍需要上面的两枚凭证。软件许可说明见[SDK 与许可证](/reference/yandu-sdk)。

## 参数方式

[全部配置字段](/reference/yandu-config) · [接入与迁移流程](/setup/yandu) · [SDK 与许可证](/reference/yandu-sdk) · [storage 命令](/reference/commands/storage)
