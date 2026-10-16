---
title: 从本地写作，到明确发布
description: 一项任务，一页说明。先写作、预览和检查，再决定哪些文章公开。
---

<script setup>
import { withBase } from 'vitepress'
</script>

<div class="handbook-opening">
  <p class="eyebrow">SACHI / CLI HANDBOOK</p>
  <h1>写下来，再决定<br>何时让它被看见。</h1>
  <p class="intro">请叫我木头人的 CLI 使用手册。不需要先记住参数：打开菜单，从眼下要完成的事情开始。</p>
</div>

```sh
npm run blog
```

已完成本机命令安装时，也可以直接运行 `blog`。方向键选择、空格勾选、Enter 确认；Ctrl+C 随时取消尚未执行的输入。[配置命令入口 →](/start/install)

<div class="handbook-routes">
<section>
  <h2>先把文章写好</h2>
  <a :href="withBase('/start/local-workflow.html')">第一次完整本地写作 →</a>
  <a :href="withBase('/writing/new.html')">新建一篇文章 →</a>
  <a :href="withBase('/writing/flow.html')">让文字绕过图片 →</a>
  <a :href="withBase('/preview/check.html')">检查正文与资源 →</a>
</section>
<section>
  <h2>再决定公开范围</h2>
  <a :href="withBase('/release/plan.html')">看懂计划，不立即上线 →</a>
  <a :href="withBase('/release/publish.html')">只发布选中的文章 →</a>
  <a :href="withBase('/backup/sync.html')">保存备份，不改变网站 →</a>
  <a :href="withBase('/troubleshooting/errors.html')">出错时，从结果开始排查 →</a>
</section>
</div>

## 手册怎么读

每项操作都有准备条件、菜单入口、编号步骤、结果验证、影响范围、常见问题和参数示例。页面顶部明确标出：是否修改本地文件、是否联网、是否改变公开网站。

- **第一次使用**：从[准备环境](/start/install)开始，暂时不配置 Git 或服务器也能写作、检查和构建。
- **已经在写作**：按左侧操作目录找任务，或搜索“封面”“撤回”“发布中断”等关键词。
- **需要脚本调用**：查看[全部命令与参数](/reference/commands)。`--json` 禁用交互，必要输入必须明确提供。

::: warning 发布不是普通保存
保存 Markdown、本地构建和 Git 备份都不会自动上线。发布默认不勾选任何文章，执行确认默认取消。`.blog-store/` 是持久数据，不能当缓存删除。
:::

## 不确定从哪一步开始

- **只想本地写一篇**：按[完整本地流程](/start/local-workflow)完成新建 → 保存 → 检查 → 预览 → BUILD_ONLY，不必先配置 Git / 服务器。
- **想用免费的 GitHub 地址上线**：按[main / blog 与 Pages](/setup/github-pages)接入；推送完成后还需等 Actions 与站点标记核实。
- **有自己的 SSH 静态服务器**：按[服务器接入](/setup/server)准备可信连接、专用根和公开路径映射，CLI 不代建服务器。
- **使用本机 Yandu＋云服务器**：按[Yandu 流程](/setup/yandu)配置，再看[每个参数填什么](/reference/yandu-config)、[两枚凭证如何创建](/setup/yandu-credentials)和[SDK 与许可证](/reference/yandu-sdk)。
- **担心丢稿，或准备换电脑**：先读[备份与恢复的区别](/reference/publishing)，再做 sync；不要把公开网页当全部写作备份。

当前 Pages 自动回滚与从 Pages 恢复持久快照尚不支持；具体能力见[模式对照](/reference/publishing)。教程会明确标出限制，不把尚未实现的操作写成已经可用。
