---
title: 配置媒体处理
scope: local
files: 编辑本篇 media.yaml；原素材不变
network: 不需要
online: 不改变
---

<script setup>
import BlogExample from '../.vitepress/theme/BlogExample.vue'
</script>

# 配置媒体处理

## 什么时候用

默认媒体处理不适合某张截图、透明插图或视频时使用。按本篇资源指定预设，不覆盖资源源文件。

## 开始前

只在有特殊需求时添加同级 media.yaml。图片与视频有默认处理规则；截图要明确选择 screenshot 预设，不假设工具会按图片内容自动识别截图。

## 操作步骤

1. 确认资源均在本篇 assets，正文已引用它们。

2. 创建 media.yaml，assets 的键使用与 Markdown 一致的相对路径。

3. 照片选 photo，设置 widths 和 quality；截图选 screenshot。

4. 环绕图维持画布和透明度，不强行套用照片缩放预设；未指定手工轮廓时从 alpha 自动生成，见[文字环绕](/writing/flow)。普通 GIF／多帧保留动画，但环绕障碍只接受静态图片。

5. 视频可指定本地 poster 图片，未指定时由转换生成。

6. 检查再构建，验证清晰度、方向、透明边缘、声音和播放。

### 预设与字段具体做什么

| 预设 / 字段 | 行为 | 注意 |
| --- | --- | --- |
| photo | 等比生成 WebP / srcset | 不放大；透明图等无损规则优先 |
| screenshot | 无损 PNG，保留清晰文字与线条 | 不是自动截图识别 |
| original | 无损 PNG 输出 | 名字不意味着源字节原样下载；GIF / 多帧另按保留规则 |
| flow | 保留透明画布的无损图片 | 仅媒体预设；仍须 frontmatter.flow 才会启用环绕 |
| widths | photo 的目标宽度列表，1–4096 px | 1–8 项；源图小则不放大，重复结果合并 |
| quality | WebP 质量，1–100，默认 85 | 不控制 PNG 无损输出或视频编码 |
| poster | 视频的本篇本地封面地址 | 源图也要存在，不能用公网图片 URL |

默认照片宽度是 640 / 1280 / 1920。动画素材保持原文件；透明图、环绕图以及 screenshot / original / flow 预设优先采用无损输出，所以不是对每种图片填写 widths 都会产生多档 srcset。

assets 的键要与引用字符串一致，`./assets/demo.mp4` 与 `assets/demo.mp4` 不混写。未被正文、cover 或 flow 引用的媒体规则不会让闲置文件自动公开；poster 是被引用视频的附属依赖，会一起冻结。

```yaml
assets:
  ./assets/cover.jpg:
    preset: photo
    widths: [640, 1280, 1920]
    quality: 85
  ./assets/screenshot.png:
    preset: screenshot
  ./assets/demo.mp4:
    poster: ./assets/poster.png
```

## 使用示例与生成效果

将[教学图片](/examples/desk.png)、[教学视频](/examples/demo.mp4)和[指定封面图](/examples/poster.png)分别保存为本篇 `assets/desk.png`、`assets/demo.mp4` 和 `assets/poster.png`。正文为：

<<< @/.vitepress/examples/media.md

在同级 media.yaml 保存以下配置，资源键必须与正文一致：

<<< @/.vitepress/examples/media.yaml

<BlogExample example="media" />

观察结果：图片保持原有比例，生成 320／640 两档 WebP，并通过 srcset 让浏览器选择；视频仍然使用原生控件，但播放前显示指定的纸张与茶杯封面，点击播放后才出现样片画面。可以对照[未指定封面的例子](/writing/video)，它使用样片首帧。

这些教学媒体是独立生成的，预览展示实际阅读组件如何使用图片尺寸、srcset、poster 与说明。正式 CLI 会再生成内容哈希路径并冻结本篇配置；改 media.yaml 不会立即改变正在公开的文章。

## 确认结果

照片生成不放大的等比 WebP／srcset；截图、透明图、环绕图采用无损输出，视频 H.264／AAC 加 poster。

## 影响与取消

转换产物进入快照和发布包，不覆盖原素材。媒体配置修改需本篇重新发布才公开。

## 常见问题

错误路径或配置会被拒绝。全局媒体规则改变属于代码／配置基线，按[全站更新](/release/baseline)处理。

## 参数方式

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog -- check <文章>
npm run blog -- build <文章> --dry-run
```
