---
title: 接入 SSH 静态服务器
scope: config
files: 保存配置；服务配置由使用者管理
network: 配置不连接；正式验收需要 SSH
online: 不改变
---

# 接入 SSH 静态服务器

## 什么时候用

准备把博客发布到已有 SSH 静态服务器时使用。CLI 不创建服务器或域名，先准备专用目录与可信连接。

## 开始前

服务器已有 OpenSSH、Python 3 和静态服务。已准备 SSH 别名与一个新的专用绝对目录。不要将现有业务网站目录交给部署器接管。

## 操作步骤

1. 先由你正常连接 SSH 别名，确认主机指纹与权限。CLI 使用严格 known_hosts 和 BatchMode，不自动接受陌生指纹。

2. 在配置向导选择 SSH，填写主机别名、专用发布根（如 /srv/sachi-blog）和正式 HTTPS siteUrl。

3. 核对配置保存，不会修改 Nginx 或安装软件。

4. 由你将静态服务公开根设置为专用目录的 current，并将共享媒体与版本资源映射为下面的路径。

5. 只公开 current、shared/media、shared/versions。源快照、代码、records、staging 和 release.json 必须保持私有。

6. 先 doctor --remote，再发布少量明确文章，核实正式站 release-marker 与真实页面。

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

### 只想在本机演练，不接公网

在 init 中选“配置本地验收部署器”，输入项目外新的专用绝对目录，Pages 与 Git 可保持未配置。它使用本机 Python 3 的类 Unix 部署环境，不要求 SSH 或域名；publish、status、history、rollback、recover 可用于本机验收。

local 模式不会自动启动 HTTP 服务，DEPLOYED 只表示本地部署器切换成功。需要浏览器看静态候选时，用[build --export 与静态预览](/release/build)，不把本机文件路径当公网 URL。

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

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog -- init
npm run blog -- doctor --remote
npm run blog -- publish <文章> --dry-run
```
