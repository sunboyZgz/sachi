---
title: 接入 SSH 静态服务器
scope: config
files: 保存配置；提供独立资源代理与服务配置模板
network: 配置不连接；正式验收需要 SSH
online: 不改变
---

# 接入 SSH 静态服务器

## 什么时候用

准备把博客发布到已有 SSH 静态服务器时使用。CLI 不创建服务器或域名，先准备专用目录与可信连接。

## 开始前

服务器已有 OpenSSH、Python 3 和静态服务。已准备 SSH 别名与一个新的专用绝对目录。不要将现有业务网站目录交给部署器接管。

完整字段、端口与文件位置见[配置参数](/reference/yandu-config)。Yandu 访问凭证、SSH 密钥和 HTTPS 证书各有用途，准备方式见[凭证与权限](/setup/yandu-credentials)；SDK 的软件许可证不用于服务器登录或 HTTPS。

## 操作步骤

1. 先由你正常连接 SSH 别名，确认主机指纹与权限。CLI 使用严格 known_hosts 和 BatchMode，不自动接受陌生指纹。

2. 在配置向导选择 SSH，填写主机别名、专用发布根（如 /srv/sachi-blog）和正式 HTTPS siteUrl。

   ```sh
   npm run blog -- init
   ```

   配置 SSH 别名、专用发布根和实际 siteUrl。

3. 核对配置保存，不会修改 Nginx 或安装软件。

   ### 保存的配置如何对照

   下面是 blog.config.json 的字段片段，不是整份文件。host 是你已配置的 SSH 别名；root 是服务器上的专用目录，不是本机项目路径；示例域名必须替换：

   ```json
   "siteUrl": "https://blog.example.com",
   "deploy": {
     "type": "ssh",
     "host": "sachi-server",
     "root": "/srv/sachi-blog"
   }
   ```

   主机别名只包含字母、数字、下划线、点或短横线；SSH 用户、端口、密钥路径通过自己的 SSH 配置管理，不把整段 `user@host -p ...` 填进 host。正式 siteUrl 不能带账号、查询或片段；若使用子路径，静态服务也要作一致映射，下面示例只展示站点根 `/` 的部署。

4. 由你将静态服务公开根设置为专用目录的 current，并将共享媒体与版本资源映射为下面的路径。

   ### 私有根与公开路径

   | 服务器路径 | 用途 | 可以公开吗 |
   | --- | --- | --- |
   | current → 某个 releases/ID/site | 当前静态站点 | 可以，作为网页根 |
   | shared/media | 带哈希的共享媒体 | 仅映射为 /media/ |
   | shared/versions | 旧 HTML 需要的版本资源 | 仅映射为 /versions/ |
   | releases 中的 code / snapshots / 清单 | 原稿、冻结代码、校验与恢复 | 不可以 |
   | records、staging、锁与管理文件 | 事务与历史 | 不可以 |

   不要开启整个部署根的目录列表，也不要为网页方便而把私有包放进 current。下方 Nginx 是需要管理员审核的配置片段，CLI 不会替你应用它：

   ```nginx
   root /srv/sachi-blog/current;
   location / { try_files $uri $uri/ =404; add_header Cache-Control "no-cache"; }
   location /media/ {
       alias /srv/sachi-blog/shared/media/;
       add_header Cache-Control "public, max-age=31536000, immutable";
   }
   location /versions/ {
       alias /srv/sachi-blog/shared/versions/;
       add_header Cache-Control "public, max-age=31536000, immutable";
   }
   location = /release-marker.json { add_header Cache-Control "no-store"; }
   ```

5. 只公开 current、shared/media、shared/versions。源快照、代码、records、staging 和 release.json 必须保持私有。

6. 先 doctor --remote，再发布少量明确文章，核实正式站 release-marker 与真实页面。

   ```sh
   npm run blog -- doctor --remote
   npm run blog -- publish <文章> --dry-run
   ```

   先只读检查并核对少量文章的发布计划，再明确执行发布。

### 只想在本机演练，不接公网

在 init 中选“配置本地验收部署器”，输入项目外新的专用绝对目录，Pages 与 Git 可保持未配置。它使用本机 Python 3 的类 Unix 部署环境，不要求 SSH 或域名；publish、status、history、rollback、recover 可用于本机验收。

local 模式不会自动启动 HTTP 服务，DEPLOYED 只表示本地部署器切换成功。需要浏览器看静态候选时，用[build --export 与静态预览](/release/build)，不把本机文件路径当公网 URL。

## Yandu 资源代理与 HTTPS

绑定 Yandu 后，部署仍由原 SSH 发布器冻结、校验并原子切换。服务器接收静态 site、发布清单、精确资源授权表和 Yandu 恢复引用；Markdown、原媒体与代码快照保存在 Yandu，不放服务器发布包。未配置 Yandu 的旧流程仍兼容原私有恢复包。

1. 完成[Yandu 项目配置](/setup/yandu)。本地上传使用 read/upload/metadata；云端为同一项目另建仅 read 凭证。先核实服务器实际网关端口：文档默认 `http://127.0.0.1:19091`，隧道转发口 19090 和 frps 7000 不是业务下载入口。
2. 将仓库 `tools/resource-proxy/server.mjs` 复制到服务器专用程序目录。它仅依赖 Node 原生模块，不要求相邻 Yandu 源码或整个博客项目。
3. 按 `deploy/resource-proxy.config.example.json` 在服务器创建 `/etc/sachi/resource-proxy.json`，填写部署根 `deployRoot`、网关 `gateway`、项目 `projectId`、独立读取凭证 `readKey`、数值端口 `port`，保留 `schemaVersion: 1`。按 `deploy/sachi-resource-proxy.service` 创建无登录用户 `sachi-resource`；配置目录 root:sachi-resource、0750，文件 root:sachi-resource、0640，确保服务可读。单元通过 `--config` 加载文件，调整 Node 路径与只读目录权限。文件不存在时才使用旧环境变量保底；文件错误或缺字段会阻止启动，不混用环境变量。
4. 将 `deploy/nginx-sachi.conf.example` 适配正式域名、证书路径和专用部署根。静态根仍是 current，`/resources/` 转发到回环 19092；清空浏览器 Authorization/Cookie，不开启目录列表。证书申请与续期使用服务器既有方案。
5. 检查并启动服务，再检查 Nginx：

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now sachi-resource-proxy
   sudo nginx -t
   sudo systemctl reload nginx
   ```

   完整安装、服务权限、站点子路径、故障及回滚说明在项目 `tools/resource-proxy/README.md`。先按真实环境核对模板，再执行这些命令。
6. `doctor --remote` 之后发布少量明确文章。正式发布前回读当前和保留版本资源摘要，失效时不切换线上。检查 HTTPS 页面、头像、附件及视频拖动；对公开资源执行 HEAD/Range：

   ```sh
   curl -I 'https://实际域名/resources/摘要/对象ID/版本ID'
   curl --range 0-1023 'https://实际域名/resources/摘要/对象ID/版本ID' -o /tmp/sachi-range.bin
   ```

   匿名原稿和未知 URL 应拒绝，条件请求应返回 304；实际测试凭证撤销、本机断网与隧道中断后再恢复。

代理只读取 current 对应私有 `resource-allowlist.json`，不扫描 releases。页面和资源授权随同一次切换生效；仍公开文章的旧资源可读，撤回文章取消所有历史资源入口。回滚沿用原命令，恢复目标清单。只读凭证不进入浏览器、静态包或 URL。

当前资源代理磁盘缓存为 0 字节，Nginx 缓存和缓冲关闭，响应 no-cache。Yandu 本机离线时未缓存媒体不可读，图片和视频显示失败提示，正文继续可读。若以后加缓存，必须同时实现容量、撤回失效和清理策略。

[本轮实际环境与待补参数](/reference/yandu-deployment)明确列出未完成的生产部署步骤；不能从本地模拟通过推定公网服务已就绪。

## 确认结果

正式域名能验证部署标记；服务器保存不可变私有包，切换发生在 current。静态服务示例需要适配自己的 server 块、TLS 与权限，并由使用者验证后生效。

## 影响与取消

绝不能把 /srv/sachi-blog 整个设置为公开根。CLI 不修改服务配置。

## 常见问题

目录含非工具文件时拒绝接管；用新的专用目录。local 部署器只用于本机验收，DEPLOYED 不等于公网可访问。

- 主机指纹报错：由你核对服务器身份与 known_hosts，不使用关闭严格检查的参数绕过。
- 权限 / 空间不足：检查专用根与共享目录的读写权限、剩余空间，再继续原冻结计划。
- 健康检查回到旧版：检查静态服务映射、siteUrl、缓存和 release-marker，不把旧页面留在缓存中视为新版本成功。
- 无法确认是否切换：保留 UNKNOWN 和 releaseId，恢复连接后先 status --remote；不要重复创建新计划。

## 参数方式

本页步骤旁已给出对应写法与结果说明。完整参数可在[命令索引](/reference/commands)按操作名查看；示例占位符请换成实际值，已安装简短命令时可把 `npm run blog --` 换成 `blog`。
