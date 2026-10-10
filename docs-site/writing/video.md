---
title: 添加短视频
scope: local
files: 原视频保留；构建生成播放资源
network: 不需要
online: 不改变
---

<script setup>
import BlogExample from '../.vitepress/theme/BlogExample.vue'
</script>

# 添加短视频

## 什么时候用

想在文章里展示一段短演示或生活片段时使用。CLI 会在构建阶段生成适合网页播放的视频和封面，不改原视频。

## 开始前

准备本地短视频并安装 ffmpeg、ffprobe。默认时长 180 秒，普通 Git 源文件最大 100 MiB。

## 操作步骤

1. 把视频放入本篇 assets/demo.mp4。

2. 正文写 `![一次小实验](./assets/demo.mp4)`，不写原始 HTML video 标签。

3. 可在 media.yaml 指定 poster，也可由转换生成首帧封面。

4. 检查文章，解决探测失败、超时长和过大文件。

5. 本地构建，等待 H.264／AAC 与 poster 生成；不自动剪辑或静默删除音轨。

6. 打开预览／构建结果检查画面、原有声音、控件和封面；默认不自动播放。

### 素材与播放器不是同一格式

源视频可用 MP4、WebM、MOV 或 M4V，正文地址仍指原素材；构建生成 H.264 视频、存在音轨时转为 AAC，并输出 MP4。页面使用处理后的哈希地址，不把 MOV 原文件直接作为网页播放地址。

默认上限是 180 **秒**和单个源文件 100 **MiB**。上限是校验规则，不是自动截断或压缩到指定体积的承诺；超出时先剪辑 / 压缩自己的原素材，必要时明确调整 blog.config.json 的 media 限制。Git 单文件上限最高仍是 100 MiB。

预览和完整构建都可能需要媒体处理时间。check 只负责检查，不证明已经转换成功。播放失败时先看 doctor 的两个视频工具，再看实际构建日志，最后用桌面与手机测试画面、声音和拖动进度。

## 使用示例与生成效果

把[四秒教学视频](/examples/demo.mp4)保存为本篇 `assets/demo.mp4`，然后在正文中写：

<<< @/.vitepress/examples/video.md

<BlogExample example="video" />

观察结果：这条 Markdown 图片语法根据资源类型被转换为 **原生视频播放器**，不是一张损坏的图片。它有播放／暂停、进度等浏览器控件，下方显示“一次小实验”；初始显示首帧封面，不自动播放。教学样片没有音轨，真实视频中的已有声音会按 CLI 转换规则保留。

如果希望指定自己的封面，在同级 media.yaml 中写：

```yaml
assets:
  ./assets/demo.mp4:
    poster: ./assets/poster.png
```

把封面图也放入本篇 assets。生成的视频控件不变，播放前的封面会换成该图片；[媒体配置页](/setup/media)提供指定封面的完整示例与对照效果。

## 确认结果

原生视频控件使用 preload=metadata，包内包含转换 MP4 和封面。

## 影响与取消

原文件不覆盖，不自动启用 Git LFS。

## 常见问题

超时长先编辑素材或按实际需要调整限制，不改扩展名绕过检查。无 ffmpeg 时纯文本写作仍可用。

## 参数方式

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog -- doctor
npm run blog -- check <文章>
npm run blog -- build <文章> --dry-run
```
