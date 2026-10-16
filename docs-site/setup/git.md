---
title: 选择 Git 备份仓库与分支
scope: config
files: 保存配置；备份时使用隔离 checkout
network: 配置不联网，sync 才连接
online: 不改变
---

# 选择 Git 备份仓库与分支

**可以复用当前项目的同一个远端仓库，不必为了分支备份另建仓库。** 代码与写作资料使用不同分支、本地隔离的 Git 工作目录；本地隔离不代表远端也必须分成两个仓库。

当前项目的完整私有备份使用[私有资料仓库](/backup/store)：原稿与历史统一在 `.blog-store/`，通过 `npm run backup` 提交推送。原 `blog sync/restore` 仍兼容内容分支格式，两者不是同一份仓库布局，也不能混用同一备份分支。

## 什么时候用

选择写作备份的远端和分支时使用。远端可与代码仓库相同，也可另选仓库；工具不切换根项目分支，不改根项目暂存区。

## 开始前

确认已有仓库地址、实际可见性和一个专用备份分支。GitHub 可见性按仓库设置，不能在公开仓库内建立私有备份分支；公开仓库的备份分支及历史也可公开读取。参见 [GitHub 仓库说明](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories)。

如果全部备份内容都允许公开，旧 `blog sync` 可以明确选择 `public`；若包含未准备公开的草稿，使用私有目标。当前完整 `npm run backup` 会核实目标为私有 GitHub 仓库，因此当前代码仓库是私有时可以直接复用，是公开时不能把完整私有备份推到其中。

## 操作步骤

1. 先选备份方式及目标。当前代码仓库为私有时，可以使用以下布局，只管理一个远端仓库：

   | 分支 | 保存范围 | 操作入口 |
   | --- | --- | --- |
   | 代码分支，如 `main` | 页面代码、当前公开个人资料配置等已提交文件 | 正常代码 Git 流程 |
   | `codex/writing-backup` | `.blog-store` 内原稿、素材、稿件历史及持久发布资料 | `npm run backup` |

   `npm run backup` 的首次配置仍需显式地址，不自动沿用根 origin；填入同一个远端地址即可，初始化本身不推送：

   ```sh
   npm run backup -- init --remote git@github.com:OWNER/sachi.git
   npm run backup -- --dry-run
   ```

   这里的 OWNER/sachi 必须替换为你实际的私有代码仓库。完整备份与恢复见[私有资料仓库](/backup/store)。已有不同资料远端时，工具会拒绝自动更换；先保留旧备份并制定迁移，不直接删除 Git 状态重新初始化。

   **以下步骤仅针对旧 `blog sync` 内容分支模式**。若已采用上面的完整备份，不必再配置一套 sync。

2. 在配置向导选择“配置或修改内容仓库”，填写实际远端地址。

   ```sh
   npm run blog -- init
   ```

   选择配置内容仓库，填写真实地址和可见性。

3. 输入专用内容分支，默认 content-source。复用代码仓库时选尚未用于代码或 Pages 的分支；不要填当前开发分支、`main`、`blog` 或完整备份的 `codex/writing-backup`。

   ### 示例配置

   向导保存后，blog.config.json 中的 git 字段类似下面片段。OWNER 与仓库名需要换成真实值；private 只是你对实际仓库设置的确认，不会把远端自动改成私有：

   ```json
   "git": {
     "remote": "git@github.com:OWNER/sachi.git",
     "branch": "content-source",
     "visibility": "private"
   }
   ```

   此例复用代码仓库的远端地址，另用 `content-source` 分支；若需要不同的访问范围再改用另一个私有仓库。根 origin 不会被自动用作 git.remote，需要明确填写。`visibility` 按整个远端仓库填写，不按分支填写。

   先用自己的 Git 方式验证目标可读写和 SSH / HTTPS 认证，再做 sync 预演。CLI 的 Git 子进程不等待交互式密码输入，不帮你安装密钥，也不应把密码写进地址。

4. 按仓库实际设置选 private 或 public。不确定时保留 unconfirmed，上传会被阻止。

5. 确认保存配置，先运行 sync --dry-run 核对全部写作范围。

   ```sh
   npm run blog -- sync --dry-run
   ```

   核对写作备份范围，没有上传。

6. 确认无敏感文件后实际同步，再通过 Git 服务核对备份。

   ```sh
   npm run blog -- sync
   ```

   确认后提交与推送专用内容分支，不合并回代码分支。

### 文章和个人资料会一起进入备份分支吗

当前两套 Git 备份都不会自动复制根目录最新的 `src/config/profile.json` 到备份分支：它仍由代码仓库的正常提交流程保存。`blog sync` 保存整个内容树、正文模板、时区和相应内容快照/发布记录；完整 `npm run backup` 保存 `.blog-store`，其中可能有冻结代码内的历史个人资料，不能将它当成当前个人资料的自动备份。

如果要求“按一次备份，把最新文章和公开个人资料一并写入同一个备份分支”，需要扩展备份与恢复清单，目前没有这个行为。Yandu 的 `storage sync` 则已经包含当前个人资料，使用方式见[Yandu 私有存储](/setup/yandu)。`.sachi/` 密钥始终不属于 Git 或写作备份。

### 第一次与多设备接入有什么不同

首次同步可在同一远端创建尚不存在的 content-source 分支；工具的独立初始历史无需从 main 派生。既有内容分支则读取其基线，再正常提交。工具只在 `.blog/git-content` 建立自己的隔离 checkout，不在 sachi 根目录执行 git init，也不把工作区切到内容分支。

同一设备已有备份基线后，不应直接换 remote / branch 再删除状态文件继续。远端或其他设备变更需要先恢复到新目录并核对，明确迁移方案；工具拒绝混用基线是保护，不是需要强推的故障。

## 确认结果

旧 sync 配置有 git.remote、branch、visibility。到所选远端的内容分支核对备份；代码分支和根暂存区保持原样。首次正式备份使用 .blog/git-content，不需要根目录已有 Git 仓库。

## 影响与取消

配置不提交、不推送。远端可以共用，但分支不会提供独立隐私；公开目标会公开已备份原稿、草稿和历史。代码与备份分支应独立维护，不通过合并把备份文件带回开发分支。

## 常见问题

远端已有其他设备新提交时拒绝覆盖，不能用 force 解决。工具不会自动配置 SSH 密钥或 LFS。

## 参数方式

本页步骤旁已给出对应写法与结果说明。完整参数可在[命令索引](/reference/commands)按操作名查看；示例占位符请换成实际值，已安装简短命令时可把 `npm run blog --` 换成 `blog`。
