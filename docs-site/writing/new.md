---
title: 新建文章
scope: local
files: 创建 index.md 与独立 assets/
network: 不需要
online: 不改变
---

# 新建文章

## 什么时候用

开始一篇新文章时使用。选择固定栏目、普通／诗歌类型并输入标题后，CLI 会生成身份、创建时间和独立资源目录，不需要手动记目录格式。

## 开始前

选择“闲暇娱乐”“生活旁白”或“蘸豆！！”。标题可含中文和标点，不需要自己生成 ID。

## 操作步骤

1. 进入“新建文章 · new”，或运行 `npm run blog -- new`。

   ```sh
   npm run blog -- new
   ```

   进入栏目、文章类型和标题问答。

2. 用方向键选择栏目，按 Enter，栏目映射为对应目录。

3. 选择“普通 Markdown”或“诗歌 Markdown”，然后输入标题。空白标题要求重输；标题不会作为目录名或 shell 命令。

   ```text
   选择文章栏目 → 生活旁白
   文章类型     → 诗歌 Markdown
   文章标题     → 寄给春天的信
   ```

   诗歌类型会写入 `type: poem`，正文单次回车即可换行，标题与诗行自动居中。完整写法与效果见[诗歌教程](/writing/poetry)。普通文章继续使用标准 Markdown 换行规则。

   ```sh
   npm run blog -- new --category learn --title "把问题写下来" --type article --slug write-a-question
   ```

   完整参数方式与菜单方式生成相同身份和目录。

4. 等待 CREATED，记下 file、id 和 slug。

   ```text
   CREATED
   file：.blog-store/content/蘸豆！！/2026-10-12/index.md
   id：<实际新UUID>
   slug：write-a-question
   type：article
   ```

   这是字段示意，日期和序号以实际返回路径为准。

5. 打开生成的 index.md 写正文，把本篇资源放入同级 assets。

6. 用[内容检查](/preview/check)和[本地预览](/preview/dev)确认文章。

   ```sh
   npm run blog -- check write-a-question
   npm run blog -- dev --post write-a-question
   ```

   用自己的实际 slug 代替教学名称。

### 栏目与参数怎么对应

| 菜单名称 / 实际目录 | 脚本参数 |
| --- | --- |
| 闲暇娱乐 | `play` 或 `闲暇娱乐` |
| 生活旁白 | `life` 或 `生活旁白` |
| 蘸豆！！ | `learn` 或 `蘸豆！！` |

目录名称固定，不通过修改标题或 frontmatter 新建第四个栏目。标题可改；目录名不是标题，默认 URL 也不是标题的拼音。

### 创建后先认识这几个输出

- `file`：用编辑器打开的 Markdown 相对路径；命令选择文章时也可使用它。
- `id`：稳定 UUID，引用另一篇文章时使用，不要复制给第二篇文章。
- `slug`：URL 中的名称。默认等于新 UUID，首次发布前可以改成 `autumn-tea` 等名称。
- `url`：博客中的路径，如 `/article/autumn-tea/`。前面加本地预览地址才可在浏览器访问。
- `type`：`article` 普通 Markdown 或 `poem` 诗歌，决定正文换行与居中排版。

一个新目录包含 `index.md` 和空 `assets/`。图片、视频、附件放进 assets；仅放入文件不会自动显示，必须在正文或封面 / flow 中引用。

忘记 ID 后可以[按中文标题找回](/writing/find)。需要插入系列并统一顺延后续章节时，先创建普通文章，再按[系列教程](/writing/series)操作；新建时直接选择系列的原有方式仍用于指定空闲序号，不自动顺延其他文章。

### 使用自己的正文模板

普通文章使用根目录 `templates/post.md`；选择 `poem` 时使用 `templates/poem.md`，该文件缺失时使用内置逐行诗歌模板。`blog init` 会补齐两份缺失模板，不覆盖已有模板。如果模板带 frontmatter，标签、摘要和 type 等可作为默认值；显式选择的类型或 `--type` 优先，但 id、title、slug、createdAt 会重新生成，category、fixture、date 不会被直接照搬。脚本未指定类型时读取 post.md，沿用其 type 或按普通文章处理。不要在模板中保留新文章目录里不存在的图片路径。

## 确认结果

生成 .blog-store/content/&lt;栏目&gt;/&lt;日期[-序号]&gt;/index.md。同日第二篇加 -02；URL 默认使用 UUID 对应的 slug，以实际返回路径为准。

## 影响与取消

只创建本地文件，不提交或发布。栏目、标题输入阶段 Ctrl+C 不留下新文章或空目录。

## 常见问题

终端未指定文章类型时会提供类型选择；`--type` 可跳过这一步。只传 --title 会再问栏目；只传 --category 会再问标题。脚本必须同时提供栏目和标题，类型可省略。

## 参数方式

本页步骤旁已给出对应写法与结果说明。完整参数可在[命令索引](/reference/commands)按操作名查看；示例占位符请换成实际值，已安装简短命令时可把 `npm run blog --` 换成 `blog`。
