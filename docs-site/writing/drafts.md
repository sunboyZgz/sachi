---
title: 留存与回看稿件
scope: local
files: 全量留存稿件；回档修改本篇正文与资源，执行前备份当前实际文件
network: 不需要
online: 不改变
---

# 留存与回看稿件

## 什么时候用

初稿、重新梳理结构、删掉一段话或重写结尾后，想把那个阶段的想法留下来，或把正文和图片一起恢复到某一稿时使用。稿件可以写备注，让以后回看时知道自己为什么修改。

只有主动执行 `draft save` 才新增稿件。日常编辑、保存文件、格式化、修改信息和发布都不会自动记一份；同一篇文章按稳定的文章 ID 保留自己的历史。

## 开始前

先保存编辑器中的文章，CLI 读取磁盘中的 Markdown。文章需要有效的身份与标题，正文可以没写完，flow 排版参数可以尚未完善，但已引用的图片、视频、封面、轮廓和视频预设中的资源必须齐备。缺图或远端媒体会拒绝存档，普通网页链接不受影响。没有 Git 仓库、部署配置或媒体工具，同样可以留存。

以下以[本地写作教程](/start/local-workflow)的 `autumn-tea` 为例，也可以用 [search 查到的文章 ID](/writing/find) 或具体 Markdown 路径。

## 操作步骤

1. 想留下初稿时，先查看留存范围和备注。

   ```sh
   npm run blog -- draft save autumn-tea --note "初稿" --dry-run
   ```

   ```text
   留存计划（未写入）
   文章：秋天的一杯茶 · <文章ID>
   留存第 1 稿 · 初稿
   原文：content/生活旁白/<创建日期>/index.md
   完整复制 …… 项文件，共 …… 字节；每稿独立保存原文与素材。
   执行后才生成稿件 ID。
   ```

   原始 Markdown、YAML 注释、BOM、换行和行尾空格会按原字节留存。新式文章保存整个本篇目录，包括 `assets/`、可选 `media.yaml` 和自己的附加文件；旧式单文件文章独立复制引用的 `public/assets/` 素材。每稿是完整普通文件目录，不与其他版本共享素材对象。

2. 核对后确认留存。

   ```sh
   npm run blog -- draft save autumn-tea --note "初稿"
   # 已核对计划，脚本中明确执行：
   npm run blog -- draft save autumn-tea --note "初稿" --yes
   ```

   ```text
   稿件已留存
   ……
   稿件 ID：<第一稿UUID>
   时间：<实际留存时间，UTC>
   记录：.blog-store/drafts/versions/<文章ID>/<第一稿UUID>/draft.json
   ```

   文章 ID 标识同一篇文章；稿件 ID 标识这一次留存，两者用途不同。标题或正式文章的日期目录改变后，仍按文章 ID 接续历史。

3. 继续写作，只有遇到下一个想纪念的阶段时再保存。

   ```sh
   npm run blog -- draft save autumn-tea --note "重写了结尾" --yes
   npm run blog -- draft list autumn-tea
   ```

   ```text
   稿件历史（本地）：
   秋天的一杯茶 · 第 1 稿 · <实际时间>
     备注：初稿
     稿件 ID：<第一稿UUID>
     文章 ID：<文章ID>
   秋天的一杯茶 · 第 2 稿 · <实际时间>
     备注：重写了结尾
     稿件 ID：<第二稿UUID>
     文章 ID：<文章ID>
   ```

   列表还会输出完整归档目录和原文路径。即使文字没变，主动再保存也会独立复制一稿，留下新的时间与备注。省略文章参数的 `draft list` 显示全部稿件。

4. 想回到初稿时，先看文件变化，再确认直接回档。

   ```sh
   npm run blog -- draft restore <第一稿UUID> --dry-run
   npm run blog -- draft restore <第一稿UUID>
   # 已核对计划，脚本中明确执行：
   npm run blog -- draft restore <第一稿UUID> --yes
   ```

   ```text
   正文与资源已回档
   目标稿件：<第一稿UUID>
   恢复旧版 · content/生活旁白/<创建日期>/index.md
   恢复旧版 · content/生活旁白/<创建日期>/assets/tea.png
   移除 · content/生活旁白/<创建日期>/assets/later.png
   回档记录 ID：<回档事务UUID>
   撤销命令：npm run blog -- draft undo <回档事务UUID>
   当前文件备份：.blog-store/writing-transactions/<回档事务UUID>
   只修改本地文件，未发布。
   ```

   回档会恢复原来的正文、素材、预设与附加文件，移除本篇后来新增的文件，保持目标版本一致；这些当前文件会先进入持久备份。如果文章移动过，回到存档时的原目录；如果文章已删除或 frontmatter 写到一半，同样可以恢复。原目录被其他文章占用时拒绝覆盖。

5. 想撤销刚才的回档，用输出中的回档记录 ID。

   ```sh
   npm run blog -- draft undo <回档事务UUID> --dry-run
   npm run blog -- draft undo <回档事务UUID> --yes
   ```

   输出“回档已撤销”，正文与素材回到回档之前的实际状态。撤销前会检查文件摘要和本篇文件清单；回档后又修改文字、图片或新增文件时拒绝覆盖，先另存自己的新编辑再核对。

6. 对比初稿和第二稿，查看文字与素材怎样变化。

   ```sh
   npm run blog -- draft diff <第一稿UUID> <第二稿UUID>
   # 省略第二个 ID，和当前已保存的文章对比：
   npm run blog -- draft diff <第一稿UUID>
   ```

   ```diff
   -当时还没想明白的一句话。
   +重新整理后留下的体会。
   ```

   输出是完整 Markdown 的逐行差异，包含元数据修改；素材和预设变化另外列出文件路径。两份不同文章的稿件不能混在一起对比。

7. 想单独读旧稿，可以显示当时的原始 Markdown。

   ```sh
   npm run blog -- draft show <第一稿UUID>
   ```

   输出稿件标题、序号、备注、时间、ID，再显示原始 Markdown。`--json` 的 `data.record` 是留存记录，`data.markdown` 是原文；查询不会修改历史或当前文章。

8. 想在编辑器中回看原稿和图片，将它们取回到独立新目录。

   ```sh
   npm run blog -- draft export <第一稿UUID> --destination ./draft-review/first --dry-run
   npm run blog -- draft export <第一稿UUID> --destination ./draft-review/first --yes
   ```

   ```text
   稿件已取回到新目录：秋天的一杯茶
   ID：<第一稿UUID>
   目录：<项目绝对路径>/draft-review/first
   原文：<项目绝对路径>/draft-review/first/content/生活旁白/<创建日期>/index.md
   当前文章保持原样。
   ```

   素材和预设按当时的原路径导出，附带 `draft.json` 留存信息。输出目录必须尚不存在，不能是当前 `content/`、公开目录、源码或持久存储。打开输出的原文即可回看；需要采用某段旧文字时，手动复制到当前稿，避免把带相同文章 ID 的旧稿直接放回 `content/`。

   安装新版 [VS Code 预览插件](/preview/dev)后，可以直接打开完整稿件目录或导出目录里的原文，运行 **Sachi Blog: 打开文章预览**。它读取这份旧稿自己的图片和视频，支持源行跟随与单击定位；无需先回档或复制到当前内容目录。查看期间不要手动修改归档文件，以免破坏其校验。

9. 以前保存的对象式稿件可以转成完整普通文件目录。

   ```sh
   npm run blog -- draft migrate autumn-tea --dry-run
   npm run blog -- draft migrate autumn-tea --yes
   ```

   输出每份转换后的完整目录，保留原稿件 ID、序号、时间和备注，旧记录也保留。省略文章参数会核对并转换全部旧稿。旧稿资源不全时明确报错，不用当前素材补成假旧版；旧原文仍可用 show 阅读，待找回当时的原件后重试。

主菜单也有“留存与回看稿件 · draft”，其中直接提供回档、撤销和旧格式转换。菜单默认先看计划；不会自动记录每次编辑。

## 确认结果

每次成功留存都有独立稿件 UUID、文章 ID、稿件序号、时间与备注。每稿目录可以直接打开，也能单独复制到备份位置，不依赖其他稿件或对象仓库：

```text
.blog-store/drafts/versions/<文章ID>/<稿件ID>/
├── draft.json
└── content/生活旁白/<创建日期>/
    ├── index.md
    ├── media.yaml
    └── assets/
        ├── tea.png
        ├── clip.mp4
        └── contour.json
```

保存和读取归档会核对文件摘要；恢复与导出还会核对全部文件清单和引用完整性。复制途中变化或缺少资源时不登记成功稿件。普通外部链接保留地址，媒体须先放进本地 `assets/`。素材不压缩、不裁剪，归档完整不代表通过排版或发布检查。

当前原稿被删除后，仍可按历史文章 ID、原 slug 或路径查看记录，并用稿件 ID 阅读、对比两份旧稿或导出。没有当前文件时，不能省略 diff 的第二个稿件 ID。

## 影响与取消

输入或确认阶段取消、`--dry-run` 都不会新增稿件，也不会生成可使用的新稿件 ID。留存前后会核对原文、素材和历史摘要，发现额外修改则停止，不覆盖历史。

完整目录复制并校验完后才提交；异常中断可能留下临时目录，不会把它们当作成功稿件。每稿独立占用完整文件空间，历史没有自动清理或自动覆盖入口。

回档会修改本地文件，恢复旧素材并移除本篇后来新增的文件；执行前在 `.blog-store/writing-transactions/` 保存当前实际文件与恢复记录，普通失败自动回滚。异常中断后重试 `draft restore` 或 `draft undo`，先恢复未完成事务；发现额外编辑则保留备份并拒绝覆盖。未恢复事务会阻止写作修改和构建发布，查询仍可使用；预演不恢复事务。

回档不会改公开清单、发布快照或自动上线，公开修订仍需明确选择文章发布。曾发布文章不能通过回档更改固定 URL。旧式文章共享素材也被其他文章使用且内容不同，会拒绝覆盖；可先 export 查看并独立处理共享资源。

取回只写独立新目录；目录已存在时拒绝覆盖，源稿和历史始终保留。导出异常时保留部分输出并报错，使用另一个新目录重试。

## 常见问题

- 为什么刚输入的文字没记下来：先保存编辑器；CLI 不读取未保存的缓冲区。
- 为什么缺图不能保存：成功稿件必须能够完整恢复，先补齐已引用素材或去掉尚未加入的图片语句，再留存。正文内容可以未完成。
- 为什么某些素材不能保存：本篇资源必须是普通本地文件，拒绝符号链接、越界引用和远端媒体；视频预设里的封面也必须存在。
- 为什么只能显示记录，取回却失败：列表读取记录信息，show 核对原文对象，export 还会核对全部素材。文件损坏或缺失时明确报错，不用当前素材冒充旧版。
- 怎么长期保存纪念稿：将整个 `.blog-store/drafts/` 随项目持久资料备份，也可单独复制完整版本目录；要保留撤销回档能力，另备份 `.blog-store/writing-transactions/`。现有 [sync](/backup/sync) 备份当前写作，不包含这份独立的稿件历史；稿件操作不会自动上传。
- 和 history 命令有什么区别：`history` 是发布记录，`draft list` 是自己主动留存的稿件历史；留存稿件不新增公开文章。

## 参数方式

[draft 参数参考](/reference/commands/draft)覆盖 save/list/restore/undo/show/diff/export/migrate。所有步骤支持 `--root` 与 `--json`，写入操作可先使用 `--dry-run`；备注最多 1000 字符，保留其原写法。
