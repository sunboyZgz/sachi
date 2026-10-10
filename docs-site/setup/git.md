---
title: 连接独立 Git 内容仓库
scope: config
files: 保存配置；备份时使用隔离 checkout
network: 配置不联网，sync 才连接
online: 不改变
---

# 连接独立 Git 内容仓库

## 什么时候用

需要把全部写作备份到独立 Git 仓库时使用。不初始化根项目仓库；仓库可见性必须按实际设置确认。

## 开始前

自己准备一个内容备份仓库，确认真实访问权限、分支和可见性。CLI 不创建 GitHub 仓库，也不自动判断其可见性。

## 操作步骤

1. 先在你使用的 Git 服务上准备仓库。含草稿时优先使用私有仓库。

2. 在配置向导选择“配置或修改内容仓库”，填写实际远端地址。

3. 输入内容分支，默认 content-source；不要使用根项目 Git index。

4. 按仓库实际设置选 private 或 public。不确定时保留 unconfirmed，上传会被阻止。

5. 确认保存配置，先运行 sync --dry-run 核对全部写作范围。

6. 确认无敏感文件后实际同步，再通过 Git 服务核对备份。

### 示例配置

向导保存后，blog.config.json 中的 git 字段类似下面片段。OWNER 与仓库名需要换成真实值；private 只是你对实际仓库设置的确认，不会把远端自动改成私有：

```json
"git": {
  "remote": "git@github.com:OWNER/sachi-writing.git",
  "branch": "content-source",
  "visibility": "private"
}
```

推荐把含草稿的写作备份与公开 main / blog 仓库分开。启用 Pages 时内容备份分支不能用 main 或 blog；根仓库 origin 也不会被自动用作 git.remote。

先用自己的 Git 方式验证目标可读写和 SSH / HTTPS 认证，再做 sync 预演。CLI 的 Git 子进程不等待交互式密码输入，不帮你安装密钥，也不应把密码写进地址。

### 第一次与多设备接入有什么不同

首次同步可能建立 content-source 分支，既有分支则读取其基线，再正常提交。工具只在 `.blog/git-content` 建立自己的隔离 checkout，不在 sachi 根目录执行 git init。

同一设备已有备份基线后，不应直接换 remote / branch 再删除状态文件继续。远端或其他设备变更需要先恢复到新目录并核对，明确迁移方案；工具拒绝混用基线是保护，不是需要强推的故障。

## 确认结果

配置有 git.remote、branch、visibility。首次正式备份使用 .blog/git-content，不需要根目录已有 Git 仓库。

## 影响与取消

配置不提交、不推送。公开内容仓库可能把全部原稿与草稿向他人开放。

## 常见问题

远端已有其他设备新提交时拒绝覆盖，不能用 force 解决。工具不会自动配置 SSH 密钥或 LFS。

## 参数方式

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog -- init
npm run blog -- sync --dry-run
npm run blog -- sync --yes
```
