---
title: 添加图片与封面
scope: local
files: 手动添加资源与 Markdown 引用
network: 不需要
online: 不改变
---

<script setup>
import BlogExample from '../.vitepress/theme/BlogExample.vue'
</script>

# 添加图片与封面

## 什么时候用

正文需要插图，或文章需要目录重点图时使用。把资源放在本篇 assets 中，让公开版本可以保留对应的原图快照。

## 开始前

准备本地图片，放在本篇 assets，不要把头像复制到文章目录。

## 操作步骤

1. 将图片复制到本篇 assets，不使用符号链接、越界路径或外链替代可恢复源文件。

2. 正文写 `![一杯茶](./assets/cup.png)`，添加有意义的说明。

3. 设置封面时，在文章信息菜单勾选“封面路径”，填 `./assets/cover.jpg`。

4. 检查文章，确认引用存在、素材可解码；然后预览。

5. 需要控制照片、截图处理方式时使用[媒体配置](/setup/media)。

6. 构建后确认图片与透明边缘。环绕图按照[专用教程](/writing/flow)处理。

### 文件与路径的约束

图片支持 PNG、JPEG、WebP、GIF、AVIF 和 SVG。使用 `./assets/desk.png` 这样的本篇相对地址，大小写与实际文件一致；不要用 `/Users/...`、`../另一篇/assets/...`、外部图片 URL 或符号链接。普通正文可以展示动画，但 flow 图片必须静态。

源文件默认最大 100 MiB，过大先在编辑器处理；改扩展名不会把不可解码素材变成图片。照片通常生成等比 WebP，多尺寸不放大原图；透明图、截图预设等采用无损 PNG，具体见[媒体规则](/setup/media)。

替代文字写图片传递的信息，不只写“图片”。它还会显示为图下注释；正文中不要把私密文件名、截图中的账户信息误当成可公开内容。

## 使用示例与生成效果

### 正文图片

把[教学图片](/examples/desk.png)保存为本篇 `assets/desk.png`，将下面内容放入 index.md 的正文。`!` 表示显示图片，中括号里的文字同时是替代文字和图片下方的说明。

<<< @/.vitepress/examples/image.md

<BlogExample example="image" />

生成效果是“完整图片 + 下方说明”，图片保持比例；在窄屏上缩小到正文宽度，不裁切。教学预览使用派生媒体，正式发布会使用本篇冻结资源的哈希地址，而不是原始 assets 路径。

### 引用式写法

同一张图片也可以先写引用名称，再在正文其他位置定义地址。两种写法生成相同的图片与说明，也都参与资源检查：

<<< @/.vitepress/examples/image-reference.md

<BlogExample example="image-reference" />

### 封面不是第二张正文图片

在原 frontmatter 中增加以下字段即可；保留 CLI 生成的身份字段：

<<< @/.vitepress/examples/cover.md

<BlogExample example="cover" />

上面仅是“此文章被选为栏目重点条目时”的示意，不是完整目录页。cover 用于目录重点图和分享图片，不会自动插入正文。要让阅读页显示图片，仍须写上面的图片语法。featured 只标记栏目精选，不会自动发布文章；同栏目有多个精选时依现有排序选择一个重点条目，普通分页条目也不会因新增封面而全部变成图片卡片。

## 确认结果

预览显示图片，正式构建只打包本篇引用资源并生成哈希媒体地址。

## 影响与取消

转换不覆盖原素材。图片修改只有本篇重新发布才公开。

## 常见问题

文件名大小写必须一致。未引用素材不会因为放进 assets 就自动公开。

## 参数方式

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog -- check <文章>
npm run blog -- meta <文章> --set 'cover=./assets/cover.jpg' --dry-run
```
