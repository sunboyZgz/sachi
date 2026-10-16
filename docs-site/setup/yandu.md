---
title: 接入 Yandu 私有存储
scope: config
files: 配置、私有映射、迁移记录及恢复目录
network: 初始化与保存需要 Yandu；本地写作可离线
online: 上传不自动公开；发布清单控制匿名访问
---

# 接入 Yandu 私有存储

## 什么时候用

将原稿、稿件历史、个人资料、头像、作品和媒体统一持久保存到 Yandu，同时保留本地编辑、预览、冻结构建与发布。Sachi 管理文章状态、目录规范和公开版本，Yandu 管理项目、配额、目录及文件，服务器托管静态站和独立只读资源代理。

第一次接入按本页顺序操作；不知道每个参数填什么时查[配置字段与端口对照](/reference/yandu-config)，创建和轮换密钥查[凭证与权限](/setup/yandu-credentials)，扩展代码查[SDK 与软件许可证](/reference/yandu-sdk)。

## 开始前

在 Yandu 创建或确认专用 `application_storage` 项目、存储位置和配额。准备本地 `read/upload/metadata` 凭证；服务器另用独立 `read` 凭证。连接参数保存在 `blog.config.json`，密钥保存在独立私密 JSON 文件中；不要把密钥写入 `blog.config.json`、网页、URL 或 Git。

配置文件优先。只有指定文件不存在时才使用环境变量；文件存在但为空、缺字段、格式错误或无法读取时直接报错，不混用环境变量补齐。

SDK 固定为 `vendor/yandu-storage-server-0.2.0.tgz`，来源及 SHA256 记录在旁边的 provenance 文件；无需相邻 Yandu 源码。根目录 `npm ci` 会安装固定分发包。

## 操作步骤

先准备凭证：在 Yandu 项目目录运行 `.local/bin/yandu --state-dir "$PWD/.yandu-storage-dev" ui --require-running` 打开管理页（开发实例的实际 state-dir 以当前运行配置为准）。进入「通用应用存储」，顶部选择专用项目，再进入「凭证」。

- 第一枚保留「读取」「上传」，勾选「目录与名称」，创建后保存到本地私密 JSON 的 `uploadKey`。
- 第二枚仅保留「读取」，保存到云端代理私密 JSON 的 `readKey`。
- 密钥原文只显示一次，保存到各自私密配置后再隐藏；不要放进聊天、Git 或网页。现有 Yandu CLI 没有代替该页面创建凭证的子命令。

两枚密钥指向同一项目。本机 Yandu 和隧道持续在线时，云服务器通过回环网关读取文件；本机关闭后静态正文仍可访问，媒体读取会失败。

1. 运行现有配置向导，最后选择「连接已有专用存储项目」，填写本地网关根地址、项目 ID 和私密 JSON 文件路径，默认 `.sachi/yandu-upload.json`。向导不接收密钥，也不连接或上传。

   ```sh
   npm run blog -- init
   ```

   保存的字段片段如下：

   ```json
   "yandu": {
     "gateway": "http://127.0.0.1:18770",
     "projectId": "sachi",
     "credentialFile": ".sachi/yandu-upload.json",
     "credentialEnv": "YANDU_UPLOAD_KEY"
   }
   ```

   本地网关通常为 18770，云端同机网关通常为 19091，以真实配置为准。不要在网关地址后添加 `/storage/v1`。

2. 将 `deploy/yandu-upload.config.example.json` 复制为 `.sachi/yandu-upload.json`，填写第一枚密钥。若已有该文件，直接编辑，保留已有凭证。项目内私密配置只能放在被 Git 忽略的 `.sachi/`；也可在向导指定项目外的私密文件绝对路径。不要放在会备份的 `.blog-store/` 或代码、public 目录。

   ```json
   {
     "schemaVersion": 1,
     "uploadKey": "填入本地上传凭证"
   }
   ```

   用 `chmod 700 .sachi` 和 `chmod 600 .sachi/yandu-upload.json` 限制本地读取权限。文件内容和路径均不进入冻结代码或恢复包；恢复到另一目录后需重新配置凭证。直接使用原 npm 入口，先检查连接，再初始化目录，无需先导出环境变量或指定 `--env-file`。

   ```sh
   npm run blog -- doctor --remote
   npm run blog -- storage init --dry-run
   npm run blog -- storage init --yes
   ```

   自动建立 `profile/avatars`、`articles`、`works`、`archives`。文章和作品按 ID 按需建目录。重复执行复用同名目录；并发 409 后重新查询；部分失败已完成目录仍保留，重试继续。绑定、目录 ID、结构版本和上传意图保存到私有 `.blog-store/yandu/`，不能当缓存清除。

3. 先查看迁移清单，再同步私有资料。沿用当前 `contentDir`，不扫描 `.git`、`.blog-archive` 或 fixture。源文件保持原位。

   ```sh
   npm run blog -- storage sync --dry-run --json
   npm run blog -- storage sync --yes
   npm run blog -- storage status
   npm run blog -- storage list
   ```

   同步涵盖原稿目录、稿件、修订快照、冻结代码、计划/记录、个人资料、原头像、作品原媒体和资源关联。迁移记录位于 `.blog-store/yandu/migrations/`。每个文件记录项目/对象/版本/SHA256/类型/大小；媒体附加尺寸或时长。先保存独立保护副本，再传输；只有 `READY` 且回读摘要一致才算保存。文件选择、Tus 100% 或请求 2xx 都不是完成依据。

   断网继续使用原有 `new`、`draft`、预览和编辑操作；`storage status` 区分本地修改和最近已保存检查点。恢复网络后重试同步，复用已核验对象与续传意图。不同客户端修改保留分支并报告冲突，不能静默覆盖；先恢复到独立目录，手动合并到本地工作副本，再明确选择全部冲突头：

   ```sh
   npm run blog -- storage sync --resolve <检查点A> --resolve <检查点B> --yes
   ```

   `--resolve` 必须完整且不重复地列出当前所有冲突头；只创建多父合并检查点，不替你合并文件。交互向导也可明确选择。失败或响应丢失继续重试相同集合。

   本命令不替代现有 Git `sync` 或 `npm run backup`。

4. 通过个人资料关联头像；头部、半身用途保持不变。原固定头像不删除。

   ```sh
   npm run blog -- storage avatar head --file ./head.png --yes
   npm run blog -- storage avatar half --file ./half.png --yes
   ```

   原图存 Yandu 私有对象；展示图转为 PNG，核验后保存 `profile.json.avatars` 的不可变引用，旧资料留在 `.blog-store/profile-history/`。日常预览使用 `public/media/profile/` 缓存，编辑器预览使用本地保护副本；正式构建只从冻结个人资料取引用。

5. 文章继续引用本篇 `./assets/` 文件，编辑器与离线预览不依赖公网。发布会把最终压缩图、不同尺寸、视频、封面及环绕轮廓保存为独立不可变对象；上传过私人原件不会自动公开。

   ```sh
   npm run blog -- storage upload article <文章ID> --file ./attachment.pdf --yes
   npm run blog -- storage upload work <作品ID> --file ./demo.mp4 --yes
   npm run blog -- publish <文章ID> --dry-run
   ```

   `storage upload` 保存按 ID 关联的私有资源及映射；正文仍通过本篇本地引用进入构建。作品沿用现有待处理资料流程，本轮不改变作品进入舞台的发布规则。页面代码、主题背景和组件图标继续跟代码版本管理。

6. 在[SSH 服务器](/setup/server)部署独立代理。代理只读发布包私有 `resource-allowlist.json` 授权的对象版本；浏览器使用 `/resources/<sha256>/<对象>/<版本>`。草稿、私人原件、目录与未激活发布包不公开。旧版本媒体按仍公开的文章保留；撤回文章后其全部历史匿名 URL 失效；回滚恢复目标清单。

7. 演练私有恢复，目标必须是全新目录：

   ```sh
   npm run blog -- storage list
   npm run blog -- storage restore <检查点名称> --destination ../sachi-recovered --dry-run
   npm run blog -- storage restore <检查点名称> --destination ../sachi-recovered --yes
   ```

   清单路径、项目绑定和逐文件摘要都通过后才移除 `RECOVERY-INCOMPLETE.json`。失败保留部分恢复资料及标记，不覆盖当前写作。恢复目录是写作资料包，需配合本项目代码和固定依赖继续使用；不含凭证、私有 `.git` 或开发电脑环境。恢复配置将凭证路径重置为 `.sachi/yandu-upload.json`，使用前在新目录配置。

## 环境变量保底

仅当 `credentialFile` 指定的文件不存在时，本地 CLI 才读取 `credentialEnv` 指定的变量，默认 `YANDU_UPLOAD_KEY`。旧的 `.env.yandu.local` 及 `deploy/yandu-upload.env.example` 仅用于这个兼容方式；需要由调用方加载，例如 `node --env-file=.env.yandu.local bin/blog.mjs storage status`。存在空白 JSON 模板时也不会回退，请填写配置文件。

云端代理默认读取 `/etc/sachi/resource-proxy.json`，可用 `--config /私密路径/配置.json` 指定。只有该文件不存在才使用旧 `resource-proxy.env` 中的环境变量，详见[服务器步骤](/setup/server)。本地上传与云端读取始终使用独立凭证。

## 确认结果

`storage status` 显示最近保存检查点；云端检查点可以恢复到新目录并核对摘要。预览、正式构建、代理匿名读取、旧版本与撤回必须分别验收。自动化只使用临时目录和本机模拟服务，不把模拟通过当成真实隧道或生产域名验收。

## 影响与取消

初始化不接管物理根，上传不移动或删除原件。停用配置只停止后续调用，保留私有云端和本地资料。所有保留发布版本引用的对象及其版本都必须保留；不要在 Yandu 删除这些对象或父目录。当前不自动清理历史对象。

## 常见问题

- 无凭证：先检查 `credentialFile` 指定的 JSON 及 `uploadKey`；仅在文件不存在时检查保底环境变量。Yandu 只存凭证摘要，旧凭证原文无法从数据库找回。
- 507：项目容量和底层卷都需充足，上传暂存与历史版本计入容量；先扩容再续传。
- 版本冲突：保留所有分支，恢复到新目录后核对，不用最新时间强行覆盖。
- 旧派生物失效：Yandu 派生物只面向当前源版本，Sachi 展示产物必须另存独立对象。
- 本机离线：静态正文仍可阅读；代理没有磁盘缓存，未读取媒体返回加载失败，恢复连接后重试。

## 参数方式

[storage 参数与子命令](/reference/commands/storage) · [真实实施与验收记录](/reference/yandu-deployment)
