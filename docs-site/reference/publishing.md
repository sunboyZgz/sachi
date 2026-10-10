---
title: 发布、备份与恢复的区别
scope: reference
---

# 发布、备份与恢复的区别

## 不同操作，影响不同

| 操作 | 采用什么内容 | 是否改公开网站 |
| --- | --- | --- |
| 保存 / dev / check | 当前本地写作 | 不改 |
| blog build | 旧公开清单加本次明确修订 | 不改，BUILD_ONLY |
| npm run build | 当前公开快照，无记录为空站 | 不改，仅导出 |
| publish | 旧成功清单＋明确冻结修订 | 成功后切换 |
| push | 已构建的同一个冻结包 | 推送 Pages，并执行已配置的服务器钩子 |
| sync | 全部写作备份，包括草稿 | 不改 |
| unpublish | 从当前清单明确移除目标 | 改，保留原稿 |
| rollback | 一个完整历史版本 | 整站切换 |
| restore | Git 内容分支 | 不改，写新目录 |
| recover | 服务器当前公开快照 | 不改，写新目录与持久存储 |

## 先选择你的使用模式

| 能力 | 纯本地 | 服务器单目标 | Pages-only | 服务器 + Pages |
| --- | --- | --- | --- | --- |
| new / meta / dev / check / build | 支持 | 支持 | 支持 | 支持 |
| publish / unpublish | 不上线，先用 build | 支持 | 支持，等 Actions 后核实 | 两个钩子分别核实 |
| push 冻结包 | 需显式提供 Pages 目标 | 会解析 Pages 目标，不是单服务器别名 | 支持 | 支持 |
| status --remote | 无线上事实可核实 | 服务器清单 | 本地 Pages 状态 + 站点标记 | 文章列表依服务器，Pages 单独展示 |
| rollback | 无公开版本可切换 | 整站回滚 | 暂不支持 | 暂不支持自动双端回滚 |
| recover | 无部署包可读取 | 当前公开包恢复 | 暂不支持 | 只能恢复服务器端公开包 |
| sync / restore | 另配内容 Git 后支持 | 另配内容 Git 后支持 | 另配内容 Git 后支持 | 另配内容 Git 后支持 |

这里“服务器”包括 local 验收部署器；local DEPLOYED 不代表公网可见。网站部署与私有草稿备份是独立选择，免费 Pages 不是内容备份仓库。

## 这些名字分别指什么

| 名称 | 如何得到 | 用在哪里 |
| --- | --- | --- |
| frontmatter | Markdown 开头两条 `---` 之间的 YAML | 标题、身份、封面、flow 等元数据 |
| 文章 id | new 自动生成的 UUID | 稳定文章身份，`blog:ID` 引用 |
| slug | new 默认同 UUID，可在首次发布前修改 | `/article/<slug>/` 地址 |
| revisionHash | 对文章元数据、正文与引用资源计算 | 判断某篇修订是否变化，定位快照 |
| releaseId | 实际规划 / 冻结过程生成，形如 r-UUID | 发布包、回执、push / resume / 回滚目标 |
| codeHash / 基线 | 对网站代码、共享资源与构建环境计算 | 防止无意引入全站变化或重建环境不一致 |
| release-marker | 静态网站上的公开 JSON 标记 | 核实网站实际服务的版本，不是私有清单 |

一个发布版本包含多篇文章，每篇有自己的修订；releaseId 不等于文章 id。dry-run 里的候选 releaseId 没有保存成冻结包，不能恢复或推送。

## 为什么发布 B 不会公开 A 的新稿

候选公开集合从上次成功清单开始，只替换明确选中的文章修订。每一篇同时冻结原 Markdown、元数据、引用素材、媒体规则与轮廓；未选文章不读取当前工作副本。站内链接的目标必须也在该集合中。

网站代码、头像和全局配置是另一条基线。其更新要单独接受，但不代表未选文章正文也随之更新。

修改 `.md`、同名替换图片、保存元数据、勾选 featured，都不会自动上线。未选草稿即使被扫描也不会进入公开集合；未选已发布文章只采用旧快照。旧快照缺失时停下恢复，绝不拿当前新稿假造上次版本。

## 三种 Git 位置不是同一个功能

| 位置 / 分支 | 维护什么 | 谁负责操作 |
| --- | --- | --- |
| 根仓库 main | 开发代码 | 使用者正常 Git 流程；CLI 不自动提交 / 推送 |
| 公开仓库 blog | 冻结公开内容、Next 源码、处理媒体、Actions | push / Pages 交付在隔离目录生成提交 |
| 独立内容 Git 的 content-source | 草稿、原素材、内容快照和发布记录 | git 配置下的 sync / 发布备份 |

main / blog 可以是同一公开 GitHub 仓库；含草稿的 content-source 建议用另一个私有仓库。根没有 Git 不影响本地写作，Pages 可明确指定远端；工具不会自动在根目录初始化仓库。

## 缓存与持久数据

- .blog/：可重建缓存、锁、隔离 Git checkout、临时恢复、旧 out 备份。
- .blog-store/：不可当缓存删除，保存 snapshots、code、plans、releases、receipts、current.json 和 Git 基线。
- out/：博客静态导出，不是原稿，不与新产物合并遗留页面。
- docs-site/.vitepress/dist/：本手册的独立静态产物，不能作为博客发布包。

`.blog-store/pages/` 还保留各 Pages 目标的推送 / 核实状态。sync 不是整个持久存储的镜像备份，restore 也不恢复整站冻结代码。尤其 Pages-only，应额外私下备份工作原稿和持久存储；公开网页不能逆向恢复原电脑。

## 发布事务与核实

确认后重新检查源文件是否变化，冻结代码和资源，按需备份 Git，再隔离构建、校验和上传；服务器在锁下比较基线，原子切换 current，健康失败回到旧版。连接中断后尝试核实实际 current，无法核实时返回 UNKNOWN。

服务器 current 是服务器端上线事实，缓存与本地回执不是。Pages 先 Git 推送，再异步运行 Actions，只有标记与本次版本一致才核实上线。PUSHED / QUEUED 不等于 DEPLOYED。

同时配置两个目标时，某一端失败不会回滚成功的一端；PARTIAL_OR_FAILED 要逐个查看 hooks。先修复同一个包的交付，再开始下一次发布。只给服务器继续原计划使用 resume；完整 Pages 包重试使用 push；Actions 自身失败查日志后重跑作业。[恢复决策表](/release/resume)。

历史私有包与共享媒体没有自动清理功能，不要手动删掉恢复所需数据。撤回只影响当前公开集合，不擦除 Git 历史、旧包或读者副本。
