---
title: Yandu SDK、接口与软件许可证
scope: reference
---

# Yandu SDK、接口与软件许可证

日常写作、上传、恢复和发布直接使用 Sachi CLI，无需手写 SDK。扩展存储适配层或排查服务端接口时使用本页；项目访问凭证如何创建见[凭证与权限](/setup/yandu-credentials)，每个配置字段见[参数表](/reference/yandu-config)。

## SDK 在整套系统里的位置

```text
本地 Sachi CLI → 存储适配层 → TypeScript SDK / 标准 Tus → Yandu
访客 → Nginx → Sachi 资源代理 → 原生 fetch 流式读取 → Yandu
```

SDK 是服务端 API 客户端，封装项目内查询和控制接口。它不创建项目凭证、不打开隧道、不生成博客公开直链，也不替 Sachi 管理目录规范和发布清单。生产资源代理只依赖 Node 原生模块，不需要在服务器安装 SDK、Next.js 或相邻 Yandu 源码。

包入口在浏览器环境会拒绝运行。不要在 React 客户端组件、网页脚本或公开构建中创建带项目凭证的实例；浏览器只请求 `/resources/...`。

## 安装与固定版本

Sachi 已在 `package.json` 使用固定归档依赖：

```json
"@yandu/storage-server": "file:vendor/yandu-storage-server-0.2.0.tgz"
```

在 Sachi 根目录执行：

```sh
npm ci
npm ls @yandu/storage-server
shasum -a 256 vendor/yandu-storage-server-0.2.0.tgz
```

包版本应为 **0.2.0**；归档摘要与 `vendor/yandu-storage-server.provenance.json` 的 `archiveSha256` 比对。该记录还固定来源提交和 OpenAPI 摘要。当前 SDK 没有发布到公共 npm 仓库，不使用 `npm install @yandu/storage-server@latest`，也不把相邻 Yandu 目录设为生产运行依赖。

若另一个服务要使用这份 SDK，将 tarball、provenance 和 `vendor/YANDU-LICENSE.txt` 一起交付，在该服务用自己的 `file:` 路径并提交锁文件。SDK 更新时从经过核验的 Yandu 版本构建、打包，更新归档和来源记录，再运行 Sachi 适配器与代理的契约测试；不要手改生成代码或直接替换已保留发布版本的资源。

## 一个可运行的只读例子

文件 `tools/examples/yandu-sdk-readonly.ts` 直接复用 Sachi 配置载入器：从 `blog.config.json` 取得项目绑定，从私密 JSON 取密钥，仅文件不存在时使用环境变量保底。程序只查询容量和分页统计根条目，不上传、不改名、不创建目录，不输出密钥和文件名。

<<< @/../tools/examples/yandu-sdk-readonly.ts

在 Sachi 根目录运行，或者将其他 Sachi 工作区路径作为最后一个参数：

```sh
npx --no-install tsx tools/examples/yandu-sdk-readonly.ts
npx --no-install tsx tools/examples/yandu-sdk-readonly.ts /你的/Sachi/工作区
```

示例输出，数字只是示意，不代表真实项目已经验收：

```json
{
  "projectId": "sachi",
  "capacity": {
    "quotaBytes": 1073741824,
    "usedBytes": 0,
    "reservedBytes": 0,
    "freeBytes": 1073741824
  },
  "rootEntries": 4
}
```

`quotaBytes` 是项目配额，`usedBytes` 含历史原件、回收站和派生物，`reservedBytes` 是上传/处理中的预留，`freeBytes` 是服务返回的当前可用容量；单位均为字节。不能只比较最新媒体文件大小与配额。失败时程序退出码为 2，不打印上游错误正文或请求头。

### Configuration 的参数怎么填

| SDK 参数 | Sachi 取值 | 作用 |
| --- | --- | --- |
| `basePath` | `yandu.gateway`，去掉尾斜线 | 网关根地址，不附 `/storage/v1` |
| `accessToken` | 私密配置的 `uploadKey`，云端另用 `readKey` | SDK 自动形成 Bearer 请求头，只传密钥原文，不再加 `Bearer ` 前缀 |
| `fetchApi` | 带超时与 `redirect: 'error'` 的 fetch | 限制请求时间和重定向；标准 Tus 请求也需要自行设置相同保护 |
| 每次方法的 `projectId` | `yandu.projectId` | 项目隔离，不能省略或用文件夹 ID 代替 |

SDK 的超时和重试不是上传持久保存保证。Sachi 仍需保留原件、持久保存上传意图、查询 READY 并回读摘要。

## 目录与查询方法

以下片段使用上面已经创建的 `api` 与 `projectId`。它会实际创建目录，适合独立测试项目；正式 Sachi 目录应调用 `storage init`，复用已有并发和失败恢复逻辑。

```ts
const folder = await api.createFolder({
  projectId,
  folderInput: { parentId: '', name: '附件' },
});
const page = await api.listEntries({
  projectId, parentId: folder.id, limit: 200,
});
```

`parentId: ''` 表示项目逻辑根，不是物理路径；`folder.id` 是服务返回的目录 ID，不是 `'附件'` 这个名字。`listEntries` 返回 `items` 和可选 `nextCursor`；遍历时传回 `cursor` 直至没有下一页。上例只取一页，完整分页见只读程序。

同名新建返回 409。Sachi 适配层会重新查询、确认同名项确实为未删除目录后复用，保存每级目录 ID 和结构版本；不能遇到 409 就当作目录已正确初始化。

| 方法 | 主要参数 | 结果 / 用途 | 权限 |
| --- | --- | --- | --- |
| `getCapacity` / `getCapabilities` | `projectId` | 容量、接口能力 | `read` |
| `listEntries` | `projectId`, `parentId`, `cursor`, `limit` | 分页条目 | `read` |
| `getEntry` | `projectId`, `entryId` | 核对目录身份、父级、名称及删除状态 | `read` |
| `createFolder` | `projectId`, `folderInput` | 新目录条目及 ID | `metadata` |
| `createUploadIntent` | `projectId`, `idempotencyKey`, `intent` | `id`, 可选对象/版本 ID, `tusEndpoint` | `upload`；指定媒体预设还需 `process` |
| `getUploadIntent` | `projectId`, `uploadId` | `state`, `objectId`, `versionId` 等 | `upload` |
| `downloadObjectRaw` / `downloadObjectHeadRaw` | `projectId`, `objectId`, `versionId`，可选区间/条件参数 | 原始 Response，可流式读取 | `read` |

## 上传：SDK 控制接口与 Tus 的分工

SDK 不提供“选中文件即可持久保存”的一步上传。Sachi 的当前实现位于 `tools/blog-cli/yandu.ts`，按以下顺序完成：

1. 保留独立本地原件，计算 SHA256；按文章/作品 ID 创建或复用逻辑目录。
2. 持久保存幂等键，调用 `createUploadIntent`，保存服务返回的上传意图与 Tus 端点。失败重试必须复用该幂等键和对应文件内容。
3. 标准 Tus POST 创建上传，`Upload-Metadata` 使用 `intentId` 的 Base64；保存返回的 Location。HEAD 查询 `Upload-Offset`，再 PATCH 余下字节。
4. 查询 `getUploadIntent({ projectId, uploadId: intent.id })`，只有 `state === 'READY'` 才进入文件核验。传到 100%、Tus PATCH 成功或意图刚创建都不表示已保存。
5. 用固定 `objectId` 和 `versionId` 回读完整字节，核对 SHA256 与大小，才保存资源引用并记录 `saved`。

| 上传意图字段 | 填写方式 |
| --- | --- |
| `idempotencyKey` | Sachi 在本地日志中持久保存并重试复用的键，不是每次请求新建一个 |
| `intent.parentId` | 服务返回的目标目录 ID |
| `intent.name` | 对象名称；Sachi 使用内容摘要命名，以复用已核验内容 |
| `intent.length` | 原始上传字节数，非 MiB |
| `intent.processing.presets` | Sachi 当前用 `[]`，在本地完成压缩后把结果作为独立原件上传 |
| `intent.objectId` / `expectedVersionId` | Yandu 的版本替换能力；Sachi 最终展示对象采用不可变保存，不靠覆盖最新版维持回滚 |

标准 Tus 请求头包括 `Authorization`、`Tus-Resumable: 1.0.0`，POST 的 `Upload-Length`、`Upload-Metadata`，PATCH 的 `Upload-Offset` 与 `Content-Type: application/offset+octet-stream`。只接受同源、当前项目范围内的 Tus 地址，不把凭证发往任意 Location。SDK 不自动替你完成这些字节传输与持久重试。

扩展 Sachi 上传行为应复用 `YanduStorage`、`uploadFile` 或 `uploadImmutable`，日常操作使用 `npm run blog -- storage upload ...`，不另写一套没有保护副本与摘要校验的上传器。

## 下载：固定版本并保留响应流

以下片段同样延续已创建的 `api/projectId`，`resource` 是 Sachi 已保存的不可变资源引用：

```ts
const response = await api.downloadObjectRaw({
  projectId,
  objectId: resource.objectId,
  versionId: resource.versionId,
});
const stream = response.raw.body;
// 逐块处理 stream，累计字节和 SHA256，与 resource.bytes/sha256 对照。
```

`downloadObjectRaw()` 返回包装对象，原生响应在 `.raw`，不是直接的 Response。完整读取使用 200，指定 `range: 'bytes=0-1023'` 时可能为 206；`ifRange`、`ifMatch`、`ifNoneMatch` 按 SDK 字段名传入。大文件不调用 `.value()`、`.blob()` 或 `.arrayBuffer()` 聚合进内存；写临时文件、核验成功后再重命名，异常时清理不完整文件。Sachi 已在 `YanduStorage.download()` 实现这些恢复规则。

**生成 SDK 会把非 2xx 响应作为 `ResponseError` 抛出**，304、412、416 也在其中。自建条件请求代理时，要从 `error.response` 获取状态和必要响应头，不能把这些正常 HTTP 分支全部变成 500。Sachi 独立公开代理直接使用原生 fetch，核对冻结 ETag、大小和区间后保留 GET、HEAD、Range、条件请求语义；不要用上面的最小下载片段替换生产代理。

历史回滚始终指定 `versionId`。Yandu 旧派生物可能在源文件替换后失效，因此 Sachi 把最终压缩图、展示视频等保存为独立原件，所有保留发布版本引用的对象都保留；只存派生物 ID 不构成长久可恢复保证。

## 云端不安装 SDK 时如何核验只读凭证

在云端以能读取该私密文件的服务用户执行以下只读程序。它只打印容量查询的 HTTP 状态，不把密钥写进命令参数、URL 或日志；不会上传文件。

```sh
sudo -u sachi-resource node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
try {
  const config = JSON.parse(readFileSync('/etc/sachi/resource-proxy.json', 'utf8'));
  const url = new URL(`/storage/v1/projects/${encodeURIComponent(config.projectId)}/capacity`, config.gateway ?? 'http://127.0.0.1:19091');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.readKey}` },
    redirect: 'error', signal: AbortSignal.timeout(20_000),
  });
  console.log(`Yandu capacity HTTP ${response.status}`);
  await response.body?.cancel();
  if (!response.ok) process.exitCode = 2;
} catch {
  console.error('Yandu connection failed');
  process.exitCode = 2;
}
JS
```

预期 200；它只证明网关、项目和读取权限可用，不能替代正式资源版本、发布清单、HTTPS 与视频拖动验收。JSON 仍需先按代理字段规则核对。

## 软件许可证怎么用

已核对 provenance 指向的 Yandu 源提交 `c1eced9df56e227801ff2a22b498144eea6f2534`，其根 `LICENSE` 为 MIT，版权声明为 `Copyright (c) 2026 Yandu contributors`。当前固定 tarball 未附 LICENSE，包元数据也未声明 `license`；Sachi 将该源版本的原文补存在 `vendor/YANDU-LICENSE.txt`，并记录在 provenance 中，保持原归档摘要不变。

MIT 允许使用、修改和分发软件；分发软件副本或其重要部分时应保留版权及许可声明。不要将其误解为访问项目文件的授权，也不代表上传到 Yandu 的文章、照片、视频都改用 MIT。具体文本以[本手册附带的原文下载](/licenses/yandu-MIT.txt)与 [OSI 的 MIT 正文](https://opensource.org/license/mit)为准。

| 场景 | 本项目的处理方式 |
| --- | --- |
| 自己运行 Sachi / SDK | 安装固定依赖，配置项目凭证；没有额外许可证激活码 |
| 将 SDK、冻结代码或包含其重要部分的程序交给其他人 | 同时保留原版权和完整 MIT 文本；本项目 `vendor/` 随冻结代码保留 |
| 重新打包或修改 SDK | 保留原版权与许可，记录自己的变更、版本和来源；不要把 OpenAPI-Generator 的 author 字段当作许可证声明 |
| 公开博客内容 | 内容和媒体权利单独管理；软件许可证不代替作者、图片或字体授权 |

这份说明只对应已核对的 Yandu 源版本；其他依赖按各自包内许可证处理，不把整个 Sachi 或所有素材一概标成 MIT。

## 对照源码与验证范围

配置契约在 `src/lib/blog/yandu.ts`、私密载入在 `tools/blog-cli/credentials.ts`、SDK 适配与 Tus 在 `tools/blog-cli/yandu.ts`、私有同步在 `yandu-sync.ts`、公开代理在 `tools/resource-proxy/server.mjs`。SDK 方法和类型以已安装的 `node_modules/@yandu/storage-server/dist/*.d.ts` 为准；不要直接改这些生成文件。

在项目根运行 `npm run test:proxy` 和相关 `yandu*.test.ts` 可做临时 HTTP 模拟验收。示例与模拟通过不表示真实隧道或服务器已部署；实际完成范围见[验收记录](/reference/yandu-deployment)。
