---
title: 全部命令与参数
scope: reference
---

# 全部命令与参数

不想记参数时运行 `npm run blog`，或已安装的 `blog`。这里的每条命令都关联具体操作教程，参数直接取自实际 Commander 定义。

## 命令索引

| 命令 | 作用 |
| --- | --- |
| [wizard](/reference/commands/wizard) | 分步选择操作，不需要记参数 |
| [init](/reference/commands/init) | 配置向导；不建立根项目 Git 仓库或连接服务器 |
| [doctor](/reference/commands/doctor) | 只读环境检查 |
| [search](/reference/commands/search) | 根据中文标题或关键词查找本地文章 ID |
| [new](/reference/commands/new) | 选择三个栏目之一，再输入标题 |
| [series](/reference/commands/series) | 查找、创建系列，或按 ID 插入章节 |
| [draft](/reference/commands/draft) | 主动全量留存稿件、查看差异、直接回档与撤销 |
| [toy](/reference/commands/toy) | 准备本地作品资料；待媒体处理，不上传或公开 |
| [list](/reference/commands/list) | 列出文章 |
| [status](/reference/commands/status) | 查看文章与备份状态 |
| [meta](/reference/commands/meta) | 选择文章，查看或修改元数据 |
| [format](/reference/commands/format) | 为选中文章正文补中英文空格；先看差异，再确认写入 |
| [dev](/reference/commands/dev) | 选择首页或文章，启动现有本地预览 |
| [check](/reference/commands/check) | 检查全部或选中的文章 |
| [build](/reference/commands/build) | 选择文章生成发布包，不上线 |
| [publish](/reference/commands/publish) | 明确选择文章并发布，或恢复冻结计划 |
| [push](/reference/commands/push) | 推送冻结发布包；执行已配置的服务器与 Pages 两个钩子 |
| [unpublish](/reference/commands/unpublish) | 选择当前公开文章撤回，保留本地原文 |
| [history](/reference/commands/history) | 查看发布记录 |
| [rollback](/reference/commands/rollback) | 选择版本整站回滚，不覆盖本地写作 |
| [sync](/reference/commands/sync) | 保存全部写作备份，不上线 |
| [restore](/reference/commands/restore) | 从 Git 恢复到尚不存在的新目录 |
| [recover](/reference/commands/recover) | 从服务器恢复当前公开快照 |

## 全局选项

| 选项 | 行为 |
| --- | --- |
| --root | 指定项目目录，避免在错误位置操作 |
| --json | 机器可读结果，禁用交互；必要输入仍须提供 |
| --yes | 跳过最终执行确认，不自动输入或全选 |
| --dry-run | 只看计划，不写快照、提交或上线；可只读查服务器 |
| --help | 显示命令帮助 |

## 两种调用方式

```sh
# 不改全局环境
npm run blog -- publish <文章> --dry-run
# 注册本机命令后
blog publish <文章> --dry-run
# 脚本读取 JSON，避免 npm 打印脚本名称
npm run --silent blog -- status --json
```

每次无参数菜单执行一项后退出。输入取消返回 130；未知参数拒绝执行，不会默默忽略。[错误处理](/troubleshooting/errors)

## 文章参数怎么填

文章操作接受实际 slug、完整 id、项目相对 Markdown 路径或文章日期目录。例如本地教程生成的 autumn-tea 可写成 `blog check autumn-tea`，也可用实际的 `content/生活旁白/日期/index.md`。它们是同一篇的不同选择方式，不是标题或浏览器 URL；路径有空格时用引号包住。

push 接受的是已构建包的 release-id，rollback 的 --to 和 publish 的 --resume 也是版本 ID；不要传文章 UUID。restore / recover 的 --destination 是尚不存在的新目录，不是当前 content。[身份与版本区别](/reference/publishing)

## 脚本结果与执行确认

成功 JSON 为 `{ command, status, data }`；错误为 `{ status, error, code, details? }`。进程退出码 0 可能只是 PLANNED、SKIPPED 或 BUILD_ONLY，必须同时判断状态。执行有影响的操作时，非交互模式需要 --yes；它不替代 --accept-baseline，也不自动提供文章、目标或恢复目录。

--dry-run 不是离线开关，已配置目标仍可能只读查询远端。对文件修改操作可先预演，但 dev --dry-run 只打印启动地址 / 命令，不真的启动服务器；new --dry-run 不创建文章或生成可使用的文章身份。自定义块源码和真实效果见[文章契约](/reference/content)。
