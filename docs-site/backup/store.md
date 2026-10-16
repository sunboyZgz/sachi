---
title: 私有资料仓库与完整备份
scope: backup
files: .blog-store 内原稿、稿件历史、发布快照与记录
network: init 核实 GitHub 可见性；backup 提交推送独立私有仓库
online: 不改变公开网站
---

# 私有资料仓库与完整备份

## 什么时候用

想把原稿、篇内素材、主动留存的旧稿、写作恢复记录和后续发布持久资料一起备份时使用。当前原稿直接位于 `.blog-store/content/`，不需要另行复制到备份目录。

代码仓库继续管理页面、模板、头像与个人配置；私有资料仓库位于 `.blog-store/.git`，使用自己的远端与 `codex/writing-backup` 分支。外层 Git 忽略整个 `.blog-store/`，不使用 submodule。Pages 继续由代码仓库的 `blog` 分支部署，备份不会公开文章或触发网站发布。

这里的“独立”指本机 `.blog-store/.git` 与根 `.git` 分开操作，**不要求另建远端仓库**。如果代码仓库本身是私有 GitHub 仓库，可在首次 init 中明确填写相同远端，分别使用代码分支与 `codex/writing-backup`。公开仓库的分支也公开，本命令仍只接受私有目标。选法见[备份仓库与分支](/setup/git)。

## 开始前

自行准备实际存在的私有 GitHub 仓库，以及 Git 和 `gh` 认证。仓库地址中的 OWNER/PRIVATE-REPO 换成自己的实际值；脚本不会创建仓库、修改可见性或沿用代码仓库的 origin。Git 作者身份使用你自己的配置。

本篇命令是项目根目录的独立 npm 脚本；原来的 `blog sync/restore` 仍用于旧内容分支格式，不管理这份完整资料仓库。

## 操作步骤

### 已使用统一存储的项目

1. 第一次配置资料仓库：

   ```sh
   npm run backup -- init --remote git@github.com:OWNER/PRIVATE-REPO.git
   ```

   脚本通过 GitHub API 核实目标为私有仓库，然后仅初始化 `.blog-store`，配置其独立 origin。此步不提交、不推送。已经配置其他远端时拒绝自动更换。

2. 先查看变化和总体积：

   ```sh
   npm run backup -- --dry-run
   ```

   PLANNED 显示资料远端、分支、待备份变化、文件数量和字节数，不联网推送、不生成提交。

3. 保存编辑器中的原稿，再执行完整备份：

   ```sh
   npm run backup
   ```

   此命令明确提交并推送资料仓库，不再逐次询问。它会再次核实私有可见性、检查远端基线与当前文件，并使用正常 Git 推送。

### 旧项目迁移

先查看计划，再执行迁移：

```sh
npm run backup -- migrate --dry-run
npm run backup -- migrate
```

只迁移原稿时，已有真实发布记录和代码快照全部留在 `.blog-store`。当前项目已经确认无发布引用的历史空站验收包，可显式附加 `--archive-empty-builds`；它会把历史 code/releases 移至 `.blog-archive/<迁移ID>/`，不会把“空站”普遍当作可删除缓存。

迁移记录包含原路径、逐文件校验值与原配置。目标已存在、存在未完成写作事务、发布引用或其他操作持有锁时停止。先保存记录，再移动，全部核验后才切换 `contentDir`。迁移期间禁止读写另一份原稿；中断后重试 `migrate` 可继续。进程被强制结束时可能留下 `.blog/backup.lock`、`writing.lock`、`publish.lock` 或 `git.lock`；先核对锁内 PID 确实已经退出，再移除报错所指的遗留锁并重试，不移除活跃进程的锁。

只有原稿、归档和配置仍与迁移记录一致时才能撤销：

```sh
npm run backup -- undo-migration <实际迁移ID>
```

该命令恢复原路径与原配置。新写作、构建或其他编辑造成冲突时拒绝覆盖。`.blog-archive` 不参与两个仓库的备份，也不作为缓存删除。

### 在新机器恢复

先克隆代码仓库并进入它的根目录，在尚不存在 `.blog-store` 时执行：

```sh
git clone --branch codex/writing-backup <私有资料仓库地址> .blog-store
npm ci
npm run blog -- list
npm run blog -- draft list
npm run dev
```

代码仓库的 `blog.config.json` 应使用 `"contentDir": ".blog-store/content"`。已经存在的资料目录先保留并比较，不覆盖克隆。冻结发布的继续构建仍要求匹配当时的代码、Node 和媒体工具，不把新环境冒充旧环境。

## 确认结果

- 首次配置返回 INITIALIZED，且 `pushed` 为 false。
- 成功上传返回 BACKED_UP，含资料仓库提交和远端；到私有仓库核对原稿、drafts 和发布记录。
- 没有新变化且远端已同步时返回 UNCHANGED，不生成空提交。
- 新机器能够列出当前文章与历史稿件；原稿和素材的字节与备份一致。

模板、公开个人资料、头像及共享视觉素材由代码仓库恢复。`public/media` 是派生预览资源，不需要复制；作品登记中引用的外部媒体仍只是引用，外部原件需要单独保存。

根目录最新 `src/config/profile.json` 不会由本命令额外复制到 `.blog-store`；须通过正常代码提交保存，或使用已包含个人资料的 Yandu `storage sync`。持久冻结代码中的历史副本不能替代尚未提交的当前个人资料。

## 影响与取消

初始化和备份都不改变外层仓库的分支、暂存区或远端，也不发布网页。初始化前或预演后可以停止。正式备份会把 `.blog-store` 的资料提交到指定私有远端，Git 历史保留此前版本。

源文件在暂存期间变化时停止；推送失败保留本地提交，重新执行 `npm run backup` 可重试上传。读写锁与检查保护 CLI 并发操作；执行期间也应暂停手工编辑。脚本不自动合并、不 reset、不强推。

## 常见问题

- **尚未初始化**：先使用明确的私有远端运行 init；脚本不会退回操作外层代码仓库。
- **认证或作者身份缺失**：先配置 Git/`gh` 身份；不要把 token 写进仓库地址或原稿。
- **远端有新提交**：先在新目录克隆并比较两边资料，再明确处理；不要强推或删除历史来绕过检查。
- **忽略规则遗漏文件**：检查 `.blog-store/.gitignore`，脚本会拒绝提交不完整备份。
- **发现符号链接、未完成临时文件或单文件超过 100 MiB**：核对对应文件后重试；脚本不会自动启用 LFS。
- **只想恢复公开网页**：那不是完整写作备份；公开分支不含全部草稿与稿件历史。

## 参数方式

`npm run backup -- --help` 查看独立脚本参数。`--root <项目目录>` 可明确指定代码项目位置；`init --remote` 仅用于首次配置，`migrate --archive-empty-builds` 仅用于已确认可分离的无引用历史验收包。不要把本页命令写成 `npm run blog -- backup`。
