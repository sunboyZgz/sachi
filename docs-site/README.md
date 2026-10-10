# Sachi CLI 手册站

VitePress 1.6.4，独立依赖锁，中文本地搜索，按任务分页。

从根目录使用 npm run docs:install、docs:dev、docs:check、docs:build、docs:preview。

默认地址 http://127.0.0.1:4174，产物 .vitepress/dist，不参与博客发布快照。

需要安装的本机 blog 命令由根项目 npm link 注册；文档安装不做全局链接。

自定义 Markdown 使用“源码 + 效果”示例，源码位于 .vitepress/examples。教学预览按需复用根项目 React 阅读组件，所以需先 npm ci；不构建 Next 页面、不读取博客 content / .blog-store，也不复制头像。npm run docs:examples 仅生成 public/examples 的独立教学媒体，docs:dev / docs:build 会自动执行。
