# 卷轴与册页作品展示

交接来源：`/Users/sunboy/Documents/temp/mutouren-gallery-handoff-v1` 与增量包 `mutouren-gallery-two-volumes-v2`。只使用独立框体与轮廓，不使用总览截图作背景，不复制包内第二套风影。素材的原生尺寸、开口几何和限制保存在 `src/lib/gallery/frames.json`、`layout.json`。

## 添加真实作品

修改 `src/config/gallery.ts` 中的 `galleryItems`。每条记录使用独立且稳定的 id：

```ts
{
  id: 'my-work',
  title: '我的作品',
  cover: '/assets/gallery/my-work.webp',
  coverFit: 'contain',
  coverPosition: [50, 50],
  description: '作品的简短说明。',
  video: '/assets/gallery/my-work.mp4',
  videoLabel: '操作演示',
  // projectUrl: '真实的 HTTP(S) 项目地址',
}
```

本段是填写格式，不是实际作品记录。将对应媒体放在 `public/assets/gallery/`；也可使用绝对 HTTPS 媒体地址。完整界面截图建议 contain，专门裁好构图的封面可用 cover。两种模式均保持比例。不要使用 fill 拉伸。无视频时省略 video；无项目地址时省略 projectUrl，不生成假链接。仅接受 HTTP(S) 项目链接，始终先开演示框、由访客主动播放。

本项目正式发布会冻结资源：如果使用 public 媒体，还须把每个文件的 `assets/gallery/...` 相对路径加入 `blog.config.json` 的 siteAssets，并保留现有八个站点素材路径。这样已有发布流水线才会把这些文件一同冻结、备份、导出和版本化。不要只把工作文件放入 public 就认定它已进入发布快照。也可将图片放入 src/assets/gallery 并静态导入其 .src；Next 为此生成内容哈希。视频仍采用显式 siteAssets 或 HTTPS 地址。外部媒体内容不会被本轮新增能力冻结，应由内容作者保证其稳定。

正式配置默认空数组；没有凭空新增项目。新版交接包前 10 件不同界面示例，仅由 INCLUDE_FIXTURES=true 从 tests/fixtures/gallery/items.json 读取。它们不是已完成的工具，第 1、8 件的视频仍是书斋测试片段，其余为缺视频状态，所有项目外链为空。测试媒体位于 public/gallery-samples，不属于默认 siteAssets，正式隔离构建不会复制它们。真实 content/ 没有新增文章或 mock。

## 布局与交互

- 桌面宽度至少 1000px：4—7 件遵守七种装裱和交接槽位；1—3 件采用居中册页。展品和已有环境共享 1586 × 992 的 cover 缩放和裁切。
- 小于 1000px：横向册页两列，独立容器自然滚动；小于 360px 为单列。全屏风影继续运行，未添加暂停、设置或常驻导航。
- 每卷最多七件，按钮“再展一卷”手动顺序循环，末卷回首卷；“前卷”用于回看，在首卷禁用。当前 10 件测试数据为七件首卷与三件末卷，编号仍连续。无自动轮替。
- 统一底部纸签承载返回文章、前卷、卷次印记、编号范围与再展一卷。手机在有限册页列表末尾分两行，不用固定按钮遮挡作品。
- 换卷先解码新封面与框体，最长等候 7 秒；成功后旧卷与新卷错峰交接约 1.574 秒。卷轴上收、册页朝书脊合拢，封面、文字和阴影同步裁切，不压缩比例。浅合页最大 18°，不是三维纸张模拟。
- 换卷期间两层 inert，重复点击忽略。Esc、尺寸变化、页面隐藏、数据变化和卸载取消未提交动作。失败仍留原卷，使用再展一卷重试；返回文章先取消换卷再恢复栏目。
- 手机换卷开始定位展品容器顶部，完成后聚焦首件；取消恢复原列表滚动。桌面焦点留在换卷控件。减少动态效果时解码后即时提交，在途偏好变化先取消。
- 拉绳预览能看到已加载的展品，但 gallery 和整个底层仍 inert。确认松手后才可点击。现有绳子、卷页、迟滞和返回路径均沿用。
- 原生 dialog 提供键盘焦点约束、Esc/关闭按钮/框外关闭。关闭立即 pause、移除 src 并 load，恢复对应封面焦点；切换尺寸后仍按作品 id 寻找按钮。
- 视频弹窗只临时暂停已有环境时钟。关闭不改写其 active 状态，保持环境原有暂停/减少动态效果/不可见状态。没有第二个 Canvas。
- 返回、页面隐藏、打印或卸载时释放视频，原栏目仍可读。图片失败时保留可点击的封面占位和完整标题；风影失败使用现有完整静态书斋。无 JavaScript 时原栏目正常展示。

## 文件职责

- `src/components/ToyGallery.tsx`：React 展品、手动分页、原生 dialog 容器。
- `src/lib/gallery/dialog.ts`：视频生命周期和焦点、框外点击。
- `src/lib/gallery/items.ts`：媒体前缀、合法链接、数据身份和少量作品构图。
- `src/lib/gallery/config.ts`：校验交接几何并转换为严格 TypeScript 元组。
- `src/lib/gallery/turn.ts`、`turn-motion.ts`、`preload.ts`：事务、确定性时间轴与可取消图片准备；逐帧直接写 DOM 样式，不更新 React 状态。时序读取 motion.json。
- `src/styles/gallery.css`：仅作用于展品和弹窗；仍使用网站颜色及字体令牌。
- `LeisureStage`、`LeisureReveal`：接入现有环境、阶段和底层 inert；没有新路由。

框体来自局部提取和透明开窗，原宽约 187—271px，未声称是高清原生设计或真实三维装裱。少量源图光照仍在素材内；独立轮廓软投影保持交接稿表现。

## 4176 测试入口

运行 `npm run dev:fixtures`，打开 `http://127.0.0.1:4176/category/play/`，拉绳或按 Enter 进入舞台。日常 4173 继续使用真实工作内容。fixture 开发缓存位于 `.next-fixtures-dev/`，与正式构建清理的 `.next/` 分开；两种静态构建仍导出到根目录 out。
