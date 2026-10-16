---
title: main / blog 分支与 GitHub Pages
scope: public
files: 冻结发布包、blog 分支与发布回执；main 不变
network: GitHub Git 与 API；核实 Pages 站点
online: Actions 成功部署后改变
---

# main / blog 分支与 GitHub Pages

当前项目的完整私有备份使用[私有资料仓库](/backup/store)：原稿与历史统一在 `.blog-store/`，通过 `npm run backup` 提交推送。原 `blog sync/restore` 仍兼容内容分支格式，两者不是同一份仓库布局。

## 什么时候用

希望同一 GitHub 仓库用 `main` 管理开发代码，用 `blog` 存放冻结的博客发布源码、公开正文与媒体，并通过 GitHub Actions 建立免费的博客网站。

`push` 执行服务器部署和推送 `blog` 触发 Pages 两个钩子：服务器未配置时显示 SKIPPED，Pages 目标则按覆盖参数、配置或 origin 解析；无法解析会要求明确输入，不把它静默跳过。它不自动提交或推送 `main`。Actions 内另分为 build 和 deploy 两个依赖作业，构建失败不会部署。

## 开始前

准备一个实际存在的**公开** GitHub 仓库，免费账户的 Pages 需要公开仓库。[GitHub 官方要求](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。工具不会创建仓库、变更可见性或自动初始化根项目 Git。

准备 Git 和 [GitHub CLI](https://cli.github.com/)，用 `gh auth login` 登录；根据所选 HTTPS / SSH Git 地址配置对应认证。启用 Pages 需要仓库管理权限。不要把 token 写到配置或仓库地址中。

保留 `.blog-store/`，它包含用于继续发布的持久快照。不要用公开 `blog` 分支代替私有草稿备份。

## 操作步骤

1. 在 GitHub 创建仓库后，核对它的真实地址。普通仓库的网址是 `https://OWNER.github.io/REPO/`；只有仓库命名为 `OWNER.github.io` 才是 `https://OWNER.github.io/`。CLI 根据目标自动判断，不需要购买域名。

2. 如果根项目已经是 Git 仓库，运行 `git remote get-url --push origin` 核对目标。CLI 使用这个地址，而不是直接解析 `.git/config`，因此也兼容 worktree 的 `.git` 文件。没有 `.git` 时可以显式配置目标，继续本地写作；CLI 不会擅自执行 git init。

   ```sh
   git remote get-url --push origin
   ```

   只读取根仓库实际推送目标；没有 Git 仓库时使用明确配置。

3. `main` 由你使用正常 Git 流程管理。提交前检查 `.gitignore` 与暂存内容；正式文章目录、环境文件、缓存和持久快照默认忽略。历史上已跟踪的草稿不会因为新增忽略规则而自动变私密，需自行审查公开仓库历史。

4. 运行 `npm run blog`，选择“配置项目与正式接入”，在 Pages 一步选“启用，默认使用根仓库 origin”，或“启用，指定目标 GitHub 仓库”。向导只保存设置，不连接 GitHub。Git 写作备份保持独立，不能使用 main 或 blog 分支。

   ```sh
   npm run blog -- init
   ```

   在 Pages 一步选择 origin 或指定真实仓库。

5. 无参数方式之外，也可运行 `npm run blog -- init --pages --yes`，启用动态 origin 默认值。配置如下；`remote: null` 表示每次读取根仓库 origin，而不是把地址复制到其他文件：

   ```json
   "pages": {
     "remote": null,
     "branch": "blog"
   }
   ```

6. 首次接入，在 GitHub 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。也可以在明确执行的 push/publish 命令上添加 `--setup-pages`，显式调用 API 启用；已有自定义域名时会拒绝覆盖。

7. 检查文章，再用 `build <文章> --dry-run` 核对计划；正式执行 `build <文章> --yes` 得到 BUILD_ONLY 回执和 release-id。这一步仍未上线，只冻结明确选择的文章。新代码基线需要单独使用 `--accept-baseline` 接受。

   ```sh
   npm run blog -- build <文章> --dry-run
   npm run blog -- build <文章>
   ```

   核对后确认构建，保存 BUILD_ONLY 返回的 releaseId。

8. 打开主菜单选择“推送冻结版本 · push”，或直接运行 `npm run blog -- push`。从已构建列表选择确切版本。它不重新读取 Markdown、当前头像或个人资料的后续修改。

9. 选择目标来源：使用配置/origin，或仅本次指定另一个 GitHub 仓库。参数方式用 `--pages-remote <GitHub仓库地址>`；覆盖不改变 origin 或永久配置。要坚持同仓库 main/blog，请核对这两个目标实际相同。

10. 先选择“只查看计划”，核对服务器目标、仓库、blog 分支、免费 URL 与当前远端提交。再执行并确认：blog 分支的**发布源码和选中正文是公开的**，不是只有导出 HTML。

    ```sh
    npm run blog -- push <release-id> --dry-run
    npm run blog -- push <release-id> --setup-pages
    ```

    核对后确认第二条；--setup-pages 显式启用 Actions 发布源。

11. 执行时，工具在 `.blog/` 的独立临时目录生成新提交，不切换根工作区分支，不暂存根文件。首次建立独立 blog 历史；后续正常追加提交，不强推，不覆盖已有非本工具管理的 blog 分支。远端在确认后变化会拒绝推送。

12. 查看回执中的两个 hooks。SSH/本地验收部署器成功显示 DEPLOYED；Pages 推送显示 QUEUED，并给出 Actions 链接。未配置服务器时 server 跳过；push 仍会执行 Pages。部分失败不会回滚已成功目标；修复后用相同 release-id 执行 push 重试，曾覆盖远端时保持同一覆盖地址。

13. 在 GitHub Actions 检查 build 和 deploy 均成功。仓库 github-pages 环境规则必须允许 blog 分支；分支保护、Actions 禁用或权限限制需要仓库管理员调整，CLI 不会自动绕过。

14. 运行 `npm run blog -- status --remote`。CLI 读取免费 URL 的 release-marker.json；只有标记与冻结版本一致，才显示 Pages DEPLOYED。Pages-only 模式未核实上线前，不能继续以排队版本为新 publish 基线。

    ```sh
    npm run blog -- status --remote
    ```

    Pages 的 release-marker 必须与冻结 ID 相同。

15. 打开主页、目录、栏目分页、文章、图片、视频与代码复制按钮。项目地址保留 `/REPO/`；SEO canonical、sitemap、头像、环绕轮廓和下载链接都应在同一路径下。

16. 接入后，`publish <文章>` 会冻结并构建新候选版本，再运行已配置的两个钩子；需要只更新 B 时只选 B，A 保留旧发布快照。`unpublish` 同样生成新版本再同步，不能用删除工作原稿代替撤回。

### 仓库地址、网站地址和优先级

| 值 | 用在哪里 | 例子 |
| --- | --- | --- |
| GitHub 仓库地址 | pages.remote / --pages-remote | `git@github.com:OWNER/REPO.git` 或 HTTPS Git 地址 |
| GitHub 官方网页 URL | 浏览器访问、Pages SEO 与标记核实 | `https://OWNER.github.io/REPO/` |
| 根仓库 origin 的 push URL | 未显式指定 Pages 远端时的默认值 | `git remote get-url --push origin` 返回值 |

有效目标按 `本次 --pages-remote → 配置 pages.remote → 根 origin push URL` 的顺序选择。根 origin 改了，remote:null 的下次目标也会改变，推送前仍要看计划。

一次性覆盖不写配置，所以之后 `status --remote` 仍使用保存的 Pages 配置 / origin。需要持续向覆盖仓库发布和核实时，在 init 中明确配置它；需要临时重试时则带回原覆盖参数。不能把某个仓库推送成功，另一个站点查询成功，拼成同一次部署的证明。

### PUSHED 后按什么顺序验收

1. 保存回执中的 releaseId、remote、commit、url 和 Actions 链接。
2. 在该仓库 Actions 找对应 blog 提交的作业，先看 build，再看 deploy；失败时从第一个失败步骤读日志。
3. 等 deploy 成功，再执行 status --remote。Pages 结果中的 pushedReleaseId 应是本次 ID，status 应为 DEPLOYED。
4. 浏览器打开回执 URL 下的 `release-marker.json`，核对 releaseId；项目站不要漏掉 `/REPO/`。
5. 打开正文和资源验证显示结果。如果标记对但个别资源 404，核对路径前缀、作业日志和缓存，不手工修改被冻结的 `.blog-input`。

两个钩子的部分失败见[继续冻结发布](/release/resume)。没有任何本地 Pages 状态时 UNVERIFIED 不能解释为“远端空站”，已有 blog 分支也不会被默认接管；应恢复对应持久数据。

## 确认结果

- main 与根工作区的分支、暂存区保持不变；只追加远端 blog 分支。
- blog 包含冻结的 Next 源码、`.blog-input` 中的明确发布数据、处理好的媒体，以及 `.github/workflows/blog-pages.yml`。不含草稿、未引用附件、fixture、根 .env、SSH/Git 备份配置、文档站或整个 .blog-store。
- Actions 使用固定 Node 版本和 npm 锁文件，先验证冻结包，再渲染静态页面。已冻结媒体不会在 Linux 上重新转换。
- PUSHED 不是上线证明；status --remote 的 Pages DEPLOYED 才表明已读到本次站点标记。

## 影响与取消

只看计划不会创建提交、写入发布记录、调用设置 API 或启用 Pages。执行确认默认取消；--setup-pages 会改变目标的 Pages 发布源，需明确查看计划。

撤回只移除当前网站页面和新提交中的正文；Git 历史可能保留以前公开内容，**不是隐私擦除**。不要发布需要以后彻底删除的秘密。免费方案采用 GitHub 官方 URL，已存在的自定义域名设置会被保护而非覆盖。

## 常见问题

- 没有 .git：指定 pages.remote 或 --pages-remote 即可；main 的初始化由你自行决定。
- origin 不是 GitHub：显式配置 github.com 仓库；不支持企业 GitHub、自定义端口或带 token 的 URL。
- 提示 gh 失败：先登录 GitHub CLI，并确认 repo/Pages 管理权限；Git SSH 认证与 gh API 登录是两套检查。
- 远端 blog 已存在：若不是本工具生成的，CLI 拒绝覆盖。先保存和检查该分支，不要强推来绕过检查。
- 某个钩子失败：查看 PARTIAL_OR_FAILED 回执；修复后 `push <同一release-id>` 重试。已部署服务器不会重复切换，已推送同包不会重复创建提交。
- Git 已推送但 Actions 失败：检查 Actions 日志后在 GitHub 重跑失败作业；同包重复 push 不会产生新 push 事件。
- Pages-only 回滚/恢复：当前自动 rollback/recover 仍仅支持服务器；启用 Pages 时 rollback 会明确拒绝，避免只回滚一端。不要手工改 blog 发布数据绕过冻结校验。保留并备份本地 .blog-store。
- 网站尚未就绪：PAGES_PENDING/QUEUED_OR_UNKNOWN 不表示构建成功；检查 Actions、环境审批与公网连接，再查询状态。

## 参数方式

本页步骤旁已给出对应写法与结果说明。完整参数可在[命令索引](/reference/commands)按操作名查看；示例占位符请换成实际值，已安装简短命令时可把 `npm run blog --` 换成 `blog`。
