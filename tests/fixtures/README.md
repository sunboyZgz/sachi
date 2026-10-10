# 排版测试内容

`content/` 中的 排版与系列测试 Markdown 都是 `fixture: true` 的测试数据，不是真实博客文章。

- 日常 `npm run dev` 和 Blog CLI 只读取根目录 `content/`，不加载这里的样例。
- `npm run dev:fixtures` 在 127.0.0.1:4176 显式预览测试内容，使用独立 Next 缓存。
- `npm run test:browser` 自动启动上述服务，不复用日常写作预览。
- `npm run build:fixtures` 只使用这里的排版样例；正式 `npm run build` 仍只读取发布快照。

旧格式引用的共享图片继续使用 `public/assets/`。不要把测试正文复制回根目录 `content/`，也不要将样例改标为正式文章发布。
