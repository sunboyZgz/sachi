---
title: 按错误与退出码排查
scope: read
files: 不修改正文
network: 核实 UNKNOWN 时需要服务器连接
online: 不改变
---

# 按错误与退出码排查

## 什么时候用

命令报错、退出、结果未知或发布后记录未同步时使用。先看状态和退出码，再核实结果，避免重复执行危险操作。

## 开始前

保留出错时的命令、状态、退出码和 release-id，不先删除 .blog-store 或强推远端。

## 操作步骤

1. 先看状态再判断：PLANNED 未执行；BUILD_ONLY 未上线；CACHED 未核实；DEPLOYED 是部署成功。

2. 退出码 2：检查必填输入、配置与确认。脚本无终端时提供必要参数和 --yes；JSON 模式不补问。

3. 退出码 3：根据文件修正内容、资源、媒体。重复 ID、缺图、越界和引用未发布目标不能忽略。

4. 退出码 4：基线或并发变化。重新查服务器并计划，不修改旧摘要绕过比较。

   系列插入或正文格式化返回 WRITING_RECOVERY_REQUIRED 时，不继续写作修改或发布，先按下方恢复记录处理；只读查找仍可运行：

   ```sh
   npm run blog -- search "朝思暮想"
   npm run blog -- series search "我学会了"
   ```

5. 退出码 5／6：分别检查 Git 权限与远端冲突、构建日志与依赖锁。根工作区不要 reset，内容仓库不要强推。

   ```sh
   npm run blog -- doctor
   ```

   先核对本地工具与配置，再处理实际失败的 Git 或构建阶段。

6. 退出码 7 或 UNKNOWN：先 status --remote 核实。不能查询时保持结果未知，恢复连接后再判断。

   ```sh
   npm run blog -- status --remote
   npm run blog -- history --remote
   ```

   这是对真实目标的只读核实，不执行重新发布。

7. 退出码 8：先区分 DEPLOYED_UNSYNCED 和 PARTIAL_OR_FAILED。前者表示服务器已上线、记录待同步；后者要逐项检查两个 hooks，不能推断全部上线或全部失败。

8. 退出码 130：输入／确认取消。若执行已开始，仍要检查有无冻结计划及真实服务器状态。

### 状态先于重试动作

| 状态 | 意味着什么 | 安全的下一步 |
| --- | --- | --- |
| PLANNED | 只看计划，没冻结或上线 | 核对后重新进入执行 |
| draft SAVED / EXPORTED | 稿件已留存 / 已取回到独立新目录 | 记录稿件 ID；当前文章和公开版本保持原样 |
| draft RESTORED / UNDONE | 正文与资源已直接回档 / 回档已撤销 | 保留回档记录 ID；公开版本保持原样 |
| draft MIGRATED | 旧稿已转成独立完整目录，原 ID 保留 | 核对目录；原记录暂时保留 |
| DRAFT_INCOMPLETE | 稿件引用的资源缺失、在远端或无法核对 | 补齐当时的本地资源；不登记不完整版本，不用当前素材冒充旧素材 |
| DRAFT_RESTORE_CONFLICT | 原路径已被占用、共享素材冲突或已发布 URL 不一致 | 核对具体冲突，先 export 回看；不覆盖其他文章 |
| DRAFT_INVALID | 稿件记录或文件损坏、路径异常 | 保留历史并检查具体文件，从完整备份取回；不修改摘要绕过校验 |
| DRAFT_EXPORT_INCOMPLETE | 导出未完成，部分新目录保留 | 核对失败原因，使用另一个新目录重试 |
| format UPDATED / UNCHANGED | 本地正文空格已保存 / 无需修改 | 预览确认；公开修订仍需明确发布 |
| PREPARED | 作品本地资料已登记，待媒体处理 | 保留原文件；不代表已压缩、上传或进入舞台 |
| LOCAL_VALID | 作品本地资料、原媒体及公网地址复查通过 | 仍待媒体处理；压缩后大小与保留秒数未知 |
| INVALID_TOY / INVALID_PROJECT_URL / PROJECT_URL_UNREACHABLE | 作品资料、媒体或匿名公网检查失败 | 根据错误修正字段、文件或项目地址；不跳过校验 |
| SOURCE_CHANGED / TOY_EXISTS | 原文件变化或重复作品 ID | 核对原文件与登记摘要；不覆盖已有身份 |
| BUILD_ONLY | 本地包完成 | 验收；不把它当已上线 |
| PUSHED / Pages QUEUED | Git 推送完成，Actions 尚待核实 | 看 Actions，再 status --remote |
| PAGES_PENDING / QUEUED_OR_UNKNOWN | 本次 Pages 标记还未核实 | 检查作业、审批、目标与连接，不继续新 publish |
| UNVERIFIED | 缺少对应 Pages 本地状态 | 恢复持久数据，不能把未知远端当空站覆盖 |
| UNKNOWN | 中断或超时，实际结果未确定 | 先查真实站点 / current，再决定继续 |
| NOT_DEPLOYED | 核实服务器没切到候选版本 | 修复交付后 resume 同一冻结 ID |
| FAILED_ROLLED_BACK | 服务器健康检查失败，回到旧版 | 查映射 / 标记 / 缓存，不当作新版本成功 |
| DEPLOYED_UNSYNCED | 服务器已上线，Git 记录未完成 | 修复备份连接，再 sync 补记 |
| PARTIAL_OR_FAILED | 含 Pages 的交付有失败 | 查看 hooks，成功目标保留，重试同一包 |
| CANCELLED | 输入或确认阶段取消 | 可重新进入；若网络执行已开始仍核实结果 |

退出码 0 也可能是 PLANNED、SKIPPED 或 BUILD_ONLY，不代表公开网站已更新。错误类别以 code + status + message 一起判断；部分 Git 基线冲突归入退出码 4，而不是所有 Git 问题都归入 5。

### 例子一：Pages 推送成功，服务器失败

回执可能在 `hooks.server` 中给出错误，在 `hooks.pages` 中给出 QUEUED。先让 Pages 作业完成并核实，再修复 SSH 连接 / 目录权限，用原 releaseId 的 push 重试。原来用了一次性远端覆盖时，照报错中的 `--pages-remote` 带回同一个地址。

不要重新 publish 当前文章来“补服务器”：那会冻结后来修改的新稿，变成另一个版本。如果是**只有服务器**的原操作，使用 publish --resume，不使用会启用 Pages 解析的 push。

### 例子二：构建失败，而文章已经继续编辑

保留 `.blog-store/plans/`、snapshots 和 code。想继续原稿用 resume；想公开新修改则在核实旧操作没有上线后，明确重新检查和规划。依赖锁 / Node / 媒体工具不匹配先恢复对应环境，不编辑旧包哈希。

### JSON 与退出码怎么看

```sh
npm run --silent blog -- status --remote --json
# 紧接上一条查看退出码，不在中间运行别的命令
echo $?
```

成功对象包含 `command`、`status`、`data`；错误对象包含 `status`、`error`、`code`，部分交付失败还含 `details.hooks`。脚本必须检查进程退出码与状态，不只判断 stdout 有没有输出。`--json` 禁用问答；必要输入缺失时 INPUT_REQUIRED，执行未明确确认时 CONFIRMATION_REQUIRED。

### 系列插入中断后的恢复

插入会修改多篇文章，恢复记录保存在 `.blog-store/writing-transactions/<事务ID>/journal.json`。其中保存修改前后内容与摘要，属于私有持久资料；不要删除记录来绕过阻止，也不要上传到公开仓库。

普通写入失败会立即回滚。异常中断后，再次执行原来的归组命令，先恢复未完成事务，再展示新计划并询问确认：

```sh
npm run blog -- series add <文章ID> --series <系列ID> --order 2
```

若旧进程留下 `.blog/writing.lock`，按照报错先核对记录中的 PID，确认旧进程已经结束后才移除该锁并重试。插入写入与发布冻结互斥；报错指向 `.blog/publish.lock` 时也须核对持有进程，不能移除仍在运行的发布锁。恢复只处理写作事务，不处理发布计划或改变线上版本。

发现额外编辑时返回 WRITING_RECOVERY_CONFLICT 或带同类原因的 WRITING_RECOVERY_REQUIRED，恢复记录和额外编辑都保留。先按 `details` 核对文件，保存额外编辑的独立副本，再用记录中的 before/after 对照修复；原文件必须明确回到其中一种状态后，才能再次安全恢复。文件缺失也必须先恢复原稿，不能用空文件代替。`--dry-run` 不执行恢复，不写记录。

ALREADY_IN_SERIES 表示文章已经归组，add 不自动换系列；SOURCE_MISSING 表示需要顺延的公开章节缺少本地源文件。修正原始问题后重试，不使用相似名称代替完整 ID。

正文格式化使用同一套恢复记录、锁和摘要校验。格式化中断后，重新执行对应的 format 命令，先恢复，再展示新的差异并确认；预演不会恢复：

```sh
npm run blog -- format <文章>
```

操作边界及逐行输出见[正文空格整理](/writing/format)。

主动留存稿件时出现 SOURCE_CHANGED，表示确认后的原文、素材或历史有变化；重新核对并生成留存计划即可。存档本身不修改源稿；`draft restore` 直接恢复本地正文和资源，先保存二进制备份到写作事务目录，`draft undo` 可撤销。回档中断后重新执行原命令会先恢复未完成事务，额外编辑冲突时保留记录并拒绝覆盖；预演不恢复。查询、导出与完整备份方式见[留存与回档稿件](/writing/drafts)。

### 求助时保留什么

记录执行命令（去掉敏感内容）、完整错误状态 / 退出码、releaseId、实际目标、Node 版本、失败作业步骤与相关文件路径。不要发送 token、SSH 私钥、整个 `.env` 或完整私有发布包；有个人资料的截图先遮盖。

浏览器文档 404 时先确认是手册 4174，还是博客 4173 / 正式网站；查看完整路径和对应章节。手册页面不存在不等于 CLI 功能未实现，应以命令帮助与本手册的支持范围为准。静态手册更新后资源 404，先停止自己启动的旧 preview、重建并重启，见[手册维护](/reference/docs-site)，不要关闭不属于本次工作的服务。

## 确认结果

依据真实状态选择修正、重新计划、继续冻结发布或备份补记，不盲目重复发布。

## 影响与取消

查询与排查本身不切换版本。删除缓存不是删除持久存储的理由。

## 常见问题

--dry-run 通过不能证明完整构建成功。环境异常时先 doctor；排版问题检查桌面和 DOM 降级，不只看静态截图。

## 参数方式

上方按错误类型给出查询与恢复写法。完整参数见[命令索引](/reference/commands)；成功与错误对象都要结合退出码和状态判断。
