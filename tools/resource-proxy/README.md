# Sachi 公开资源代理

`server.mjs` 是服务器端独立 Node 程序，只使用 Node 原生模块和 `fetch`。生产机无需安装 Sachi、Next.js、Yandu 源码或 npm 依赖。使用维护中的 Node 22/24 LTS；最低 API 要求与博客一致为 Node 20.9。仅监听 `127.0.0.1`，默认端口 `19092`。

## 已核实的接口契约

依据随 Sachi 固定的 `@yandu/storage-server` **0.2.0**，使用原件版本接口：

```text
GET  /storage/v1/projects/{projectId}/objects/{objectId}/content?versionId={versionId}
HEAD /storage/v1/projects/{projectId}/objects/{objectId}/content?versionId={versionId}
Authorization: Bearer <server-read-key>
```

`Range`、`If-Range`、`If-Match`、`If-None-Match` 透传。Yandu 用 SHA256 的双引号形式作为强 ETag。代理核对冻结摘要对应的 ETag、完整大小、区间总大小和区间长度；完整 GET 也流式计算 SHA256，发现损坏时终止响应。区间只能验证该区间长度及上游的版本摘要。支持单个字节区间；多区间请求返回 416。不会调用派生物读取接口：展示产物应先作为独立原件上传，避免派生物随原件替换而失效。

## 授权与发布清单

公开 URL 固定为 `/resources/<sha256>/<objectId>/<versionId>`，不含项目凭证。每个请求都重新解析专用部署根中的 `current → releases/r-…/site`，读取其**父目录**的私有 `resource-allowlist.json`：

```json
{
  "schemaVersion": 1,
  "releaseId": "r-example-00000001",
  "activeOwnerIds": ["article-uuid", "profile"],
  "resources": [
    {
      "projectId": "sachi",
      "objectId": "object-id",
      "versionId": "version-id",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "mime": "image/webp",
      "bytes": 12345,
      "ownerId": "article-uuid",
      "path": "/resources/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/object-id/version-id"
    }
  ]
}
```

`path` 必须与引用计算的 URL 完全一致；项目必须等于代理配置中的 `projectId`，owner 必须仍在 `activeOwnerIds` 中。图片尺寸、视频时长可随引用保存。未知路径、目录、查询参数、草稿或未启用 owner 返回 404；方法仅允许 GET/HEAD。代理不提供列表、上传、恢复或任意上游地址转发。

发布器把当前仍公开文章及个人资料的保留资源版本并入该清单。**不扫描 `releases/`**：尚未发布的包也会出现在此目录中，不能以“存在于某个 release”作为公开授权。清单存放于 `site` 外并由包校验覆盖。切换 `current` 同时切换网页和资源授权；回滚读取目标版本的清单。撤回 owner 后其历史 URL 也失去匿名授权，重新发布/回滚后按对应清单恢复。

一次请求开始后不因后续切换清单强制打断已开始的传输。HTTP 无法收回访客已经下载的文件；对必须立即停止的上游读取，应同时撤销该服务端只读凭证或暂停 Yandu 项目。

## 配置与安装

生产前集中核实：SSH 别名/用户/端口和 known_hosts、域名 DNS、HTTPS 证书与续期方式、专用部署根、Node 绝对路径、静态服务用户、资源代理服务用户、Yandu 网关真实端口/运行模式、专用项目 ID、独立的只读凭证。本地上传凭证需要 read/upload/metadata，不能用作云端只读凭证。

1. 将 `server.mjs` 复制至服务器 `/opt/sachi-resource-proxy/server.mjs`。这是唯一必需程序文件。
2. 创建无登录权限的 `sachi-resource` 服务用户。只授予它遍历专用部署根、读取 `current` 指向的 release 及私有资源清单的权限；无需写权限，也无需读取原稿正文。
3. 参照 `deploy/resource-proxy.config.example.json` 创建 `/etc/sachi/resource-proxy.json`，填写 `deployRoot`、`gateway`、`projectId`、`readKey` 和数值 `port`，保留 `schemaVersion: 1`。目录设为 root:sachi-resource、0750，文件设为 root:sachi-resource、0640，供服务用户只读。不要把真实文件加入 Git、博客包或静态导出。`readKey` 仅供此服务使用，网关 URL 不含密钥，默认 `http://127.0.0.1:19091` 只表示云端同机网关。
4. 参照 `deploy/sachi-resource-proxy.service` 安装 systemd 单元。`ExecStart` 默认使用 `--config /etc/sachi/resource-proxy.json`；修改 Node 路径、程序路径及 `ReadOnlyPaths`，使其与真实部署根一致。先 `systemctl daemon-reload`，再 `systemctl enable --now sachi-resource-proxy`。更改配置或轮换凭证后 `systemctl restart sachi-resource-proxy`。
5. 将 Nginx 模板并入已有站点，替换域名、证书与部署路径。`root` 必须是 `…/current`，私有 `releases`、records、staging 及清单不公开。先运行 `nginx -t`，通过后 reload。模板保留原 `/media/` 和 `/versions/` 的代码/主题及旧发布访问能力。
6. 若 siteUrl 使用 `/blog` 子路径，把资源 location 改为 `/blog/resources/`，并使用 `proxy_pass http://127.0.0.1:19092/resources/;` 将其映射回 canonical 资源路径；同时按现有部署说明映射其他静态路径。不要让 `/blog` 进入私有 allowlist 的 path。
7. 先通过本机回环 URL核验已发布对象 HEAD/Range，再通过正式 HTTPS 验证公开读取和撤回。健康检查不存在公开的绕过入口；对未知资源返回 404 属于正常结果，配置错误或上游不可用返回 503。

本目录及 deploy 仅交付可审查模板，不会安装软件、改防火墙、生成证书或修改真实服务器。

配置文件存在时完全以文件为准，不用环境变量补齐。`gateway` 和 `port` 省略时使用程序默认值 19091、19092；其余字段必须提供。空文件、无效 JSON、未知字段、缺少必填项或读取失败会阻止启动，不回退到环境变量。

只有 `--config` 指定的文件（未指定时为 `/etc/sachi/resource-proxy.json`）不存在，才读取 `SACHI_DEPLOY_ROOT`、`YANDU_GATEWAY`、`YANDU_PROJECT_ID`、`YANDU_READ_KEY`、`SACHI_RESOURCE_PORT`。单元中的可选 `EnvironmentFile=-/etc/sachi/resource-proxy.env` 仅为旧部署保底；其模板 `deploy/resource-proxy.env.example` 不再是常规配置步骤。若使用此保底文件，由 systemd 读取，可设 root:root、0600。

## 缓存、故障与回滚

服务端磁盘缓存容量为 **0 字节**，无清理任务；Nginx 关闭代理缓存及缓冲。响应 `Cache-Control: no-cache`，浏览器每次重用需重新验证，代理先授权再把条件请求交给 Yandu。之后若启用 CDN/磁盘缓存，必须一并实现授权前置、容量上限、撤回失效与清理；不能给资源 location 叠加 immutable/max-age 缓存。

本机离线、隧道断开、网关连接拒绝/超时或凭证无效时，未完成的读取会失败：开始响应前返回无内部细节的 503（少数契约错误为 502）；中途断流则终止连接，浏览器显示媒体加载失败或附件下载失败，可恢复连接后重试。代理不会以假图片或空文件替代完整正文。上游响应/私密错误、Cookie、凭证不向访客或日志转发，重定向不跟随。HTML/SVG 等附件以 attachment 返回，并附加 CSP sandbox 和 nosniff，避免把主动内容作为同源页面执行。

博客继续通过既有 `rollback` 切换冻结发布包；资源授权随该目标清单恢复，无须重启代理。服务升级前保留上一份 `server.mjs` 和 systemd 单元，必要时恢复文件并 restart；恢复旧服务程序时仍保留当前清单授权，不能退回公开整个项目。保留发布引用的 Yandu 独立对象/版本不可删除，回收站会导致指定历史版本无法读取。

## 本地集成验收

```sh
node --test tools/resource-proxy/integration.test.mjs
```

测试只用临时部署根与本机 HTTP mock Yandu，无真实凭证/服务器。覆盖 GET、HEAD、单区间视频拖动、If-Range、If-Match、304、416、16 MiB 渐进式传输、历史对象读取、草稿/其他项目/目录/未发布包拒绝、撤回与回滚、凭证/隧道错误、超时、重定向拒绝及离线连接拒绝。真实 Yandu、真实隧道和生产 HTTPS 必须在获得上述实际参数后另行验收。
