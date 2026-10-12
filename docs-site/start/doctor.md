---
title: 检查运行环境
scope: read
files: 不修改正文
network: 只有选择服务器或 Pages 检查时需要
online: 不改变
---

# 检查运行环境

## 什么时候用

第一次运行 CLI，或遇到工具缺失、媒体处理失败、服务器环境不匹配时，先用只读诊断定位环境问题。

## 开始前

项目依赖已安装；检查服务器前需要部署配置。

## 操作步骤

1. 进入菜单选择“检查运行环境”。

   ```sh
   npm run blog -- doctor
   ```

   CHECKED 报告本地工具与配置。

2. 有部署或 Pages 配置时选择本地信息或只读远端查询；没有配置时只检查本地。

   ```sh
   npm run blog -- doctor --remote
   ```

   只读检查已配置目标；没有目标时先使用本地检查。

3. 查看 Node.js、时区、Git 集成和部署类型。

4. 查看 Git、Python 3、ffmpeg、ffprobe。尚未使用对应功能时，部分工具缺失不影响写作。

5. 按需补齐后再次检查：部署需要 Python 3；视频检查和转换需要 ffmpeg 与 ffprobe。

### 按实际功能准备工具

| 功能 | 需要的环境 | 说明 |
| --- | --- | --- |
| 新建、修改、纯文本检查 | 项目支持的 Node.js、npm 和根依赖 | 先完成 npm ci |
| 预览、正式构建 | 上述环境和已安装的 Next / Sharp | 不需要根 Git 仓库 |
| 视频检查、转换 | ffprobe、ffmpeg | 两者都要可从终端调用 |
| 独立内容备份、Pages Git 推送 | Git 和目标仓库认证 | 根仓库与独立内容仓库不是一回事 |
| 本地验收部署 | 本机 Python 3 | 不是公网托管 |
| SSH 部署 | SSH、可信 known_hosts、远端 Python 3 | 使用已配置的主机别名和专用根 |
| GitHub Pages 接入 | Git、GitHub CLI 与 gh 登录 | Git 与 GitHub API 认证分别检查 |

doctor 报告的是环境信息，并不是一次完整的部署演练。例如，本地 doctor 不会证明 SSH 公钥可用，也不会完整验证 Actions 权限；Pages 首次推送仍需按[接入教程](/setup/github-pages)验收。

若工具刚安装仍显示 unavailable，先在同一终端运行它的版本命令，确认 PATH 生效，再重跑 doctor。不要把密钥、token 或密码粘进报告或 blog.config.json。

## 确认结果

返回 CHECKED。环境报告不代表文章已通过检查或网站已上线。

## 影响与取消

不修改正文、不提交、不切换服务器版本。

## 常见问题

可选工具 unavailable 不等于 CLI 全部不可用。服务器查询失败时检查配置、SSH 别名和指纹，不重复发布。

## 参数方式

本页步骤旁已给出对应写法与结果说明。完整参数可在[命令索引](/reference/commands)按操作名查看；示例占位符请换成实际值，已安装简短命令时可把 `npm run blog --` 换成 `blog`。
