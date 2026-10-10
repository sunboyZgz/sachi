---
title: 新建文章
scope: local
files: 创建 index.md 与独立 assets/
network: 不需要
online: 不改变
---

# 新建文章

## 什么时候用

开始一篇新文章时使用。选择固定栏目并输入标题后，CLI 会生成身份、创建时间和独立资源目录，不需要手动记目录格式。

## 开始前

选择“闲暇娱乐”“生活旁白”或“蘸豆！！”。标题可含中文和标点，不需要自己生成 ID。

## 操作步骤

1. 进入“新建文章 · new”，或运行 `npm run blog -- new`。

2. 用方向键选择栏目，按 Enter，栏目映射为对应目录。

3. 输入标题。空白标题要求重输；标题不会作为目录名或 shell 命令。

4. 等待 CREATED，记下 file、id 和 slug。

5. 打开生成的 index.md 写正文，把本篇资源放入同级 assets。

6. 用[内容检查](/preview/check)和[本地预览](/preview/dev)确认文章。

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

一个新目录包含 `index.md` 和空 `assets/`。图片、视频、附件放进 assets；仅放入文件不会自动显示，必须在正文或封面 / flow 中引用。

### 使用自己的正文模板

编辑根目录 `templates/post.md`，后续 new 会读取它，已有文章不受影响。可只放常用二级标题与正文；如果带 frontmatter，标签、摘要等可作为默认值，但 id、title、slug、createdAt 会重新生成，category、fixture、date 不会被直接照搬。不要在模板中保留新文章目录里不存在的图片路径。

## 确认结果

生成 content/&lt;栏目&gt;/&lt;日期[-序号]&gt;/index.md。同日第二篇加 -02；URL 默认使用 UUID 对应的 slug，以实际返回路径为准。

## 影响与取消

只创建本地文件，不提交或发布。栏目、标题输入阶段 Ctrl+C 不留下新文章或空目录。

## 常见问题

只传 --title 会再问栏目；只传 --category 会再问标题。脚本必须同时提供两者。

## 参数方式

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog -- new
npm run blog -- new --category "蘸豆！！" --title "把问题写下来" --dry-run
npm run blog -- new --category learn --title "把问题写下来" --slug write-a-question
```
