---
title: 初始化与保留本地模式
scope: config
files: 保存配置；仅创建缺失模板
network: 不需要
online: 不改变
---

# 初始化与保留本地模式

## 什么时候用

第一次准备写作目录和模板，或修改时区、Git、部署设置时使用。可一直保留纯本地模式，只启用确实需要的接入。

## 开始前

准备时区，例如 Asia/Shanghai。Git 内容仓库与服务器不是必填项目。

## 操作步骤

1. 打开菜单选择“配置项目与正式接入”。

   ```sh
   npm run blog -- init
   ```

   终端依次询问时区、Git、部署和 Pages，尚未保存配置。

2. 输入时区，或 Enter 保留当前值。日期目录按该时区生成。

3. 在 Git 设置保留未配置状态，或按[Git 接入](/setup/git)填写。内容备份仓库不同于根项目仓库。

4. 在部署设置保留未配置状态，或按[服务器接入](/setup/server)填写。“停用”会明确清除对应配置。

5. 在 Pages 一步保留未启用，或按[GitHub Pages 接入](/setup/github-pages)选择 origin / 指定仓库。根 Git 仓库不存在时，不要选择依赖 origin 的方式；可明确指定已有 GitHub 仓库。

6. 核对提示并确认。默认取消；未确认前不写入配置。

   ```sh
   npm run blog -- init --timezone Asia/Shanghai --dry-run
   ```

   PLANNED 显示配置计划；核对后去掉 --dry-run 并完成确认。

7. 检查 blog.config.json、三个栏目目录与 templates/post.md。已有模板不会覆盖。

### 只在本地写作，应该怎么选

时区输入 `Asia/Shanghai`；Git、部署、Pages 都选“保留当前设置”。如果以前已经启用过某项，保留不会停用它，应明确选该项的“停用”。最终确认后，纯本地配置中的三项应为：

```json
"git": null,
"pages": null,
"deploy": null
```

这是 blog.config.json 中的字段片段，不是可直接替换整个文件的 JSON。其余字段保持不变。`siteUrl: null` 表示尚无正式站点地址，`codeRef: null` 表示冻结当前工作区代码；不要为了本地使用填上示例域名或不存在的 Git 引用。

### 三种接入不要混淆

| 设置 | 用来做什么 | 不会做什么 |
| --- | --- | --- |
| git | 把写作和快照备份到独立内容分支 | 不发布网页，不管理 main |
| deploy | 把发布包交给 SSH 服务器或本机验收目录 | 不创建服务器、TLS 或静态服务配置 |
| pages | 推送公开 blog 分支，让 Actions 构建网站 | 不自动提交 main，不是私有草稿备份 |

三项均可独立为空。配置只是保存目标；真正联网写入发生在后续明确的发布、推送或备份操作中。

## 确认结果

返回 INITIALIZED。Git 与部署 disabled 时仍可新建、检查、预览和本地构建。

## 影响与取消

只保存配置，不创建远端、不连接服务器、不修改静态服务，也不创建根 Git 仓库。

## 常见问题

脚本用 init --yes 保留现有设置并创建缺失模板；时区错误拒绝执行。

## 参数方式

本页步骤旁已给出对应写法与结果说明。完整参数可在[命令索引](/reference/commands)按操作名查看；示例占位符请换成实际值，已安装简短命令时可把 `npm run blog --` 换成 `blog`。
