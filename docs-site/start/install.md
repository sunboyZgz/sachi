---
title: 准备环境与命令入口
scope: local
files: 安装本地依赖；可选注册命令
network: 安装依赖时需要
online: 不改变
---

# 准备环境与命令入口

## 什么时候用

第一次在本机使用 CLI，或希望把 npm 入口注册为简短的 blog 命令时，先完成本页。注册命令不是发布网站，也不要求先建立 Git 仓库。

## 开始前

终端当前目录应是 sachi 根目录，能看到 `package.json`、`tools/` 和 `content/`。需要 Node.js 20.9 或更高版本，不要求根目录是 Git 仓库。

## 操作步骤

1. 运行 `node --version` 和 `npm --version`，确认运行环境可用。

2. 在项目根目录运行 `npm ci`，按锁文件安装博客与 CLI 依赖。不要在视觉交接包内安装。

3. 运行 `npm run blog`，终端会出现操作菜单，无需输入子命令。

4. 如果希望直接输入 `blog`，可在根目录主动运行一次 `npm link`。这会在当前 npm 全局目录注册本项目的命令链接，不初始化 Git 或发布文章。

5. 随后在 sachi 根目录运行 `blog`。不想改全局环境时继续使用 `npm run blog` 或 `./bin/blog.mjs`，功能相同。

### 第一次安装的最小顺序

在编辑器中打开整个 sachi 项目，再打开它的终端，依次运行：

```sh
pwd
node --version
npm --version
npm ci
npm run blog -- doctor
npm run blog
```

`pwd` 应显示你的 sachi 根目录，而不是 `docs-site`、`content` 或 `mutouren-ui-kit`。`npm ci` 安装成功后才运行后两条；如果安装失败，保留错误信息，先解决网络、Node 版本或锁文件问题，不删除锁文件来绕过错误。

### 博客与手册是两个服务

| 要看什么 | 启动命令 | 浏览器地址 | 停止方式 |
| --- | --- | --- | --- |
| 当前写作的博客 | `npm run dev` 或菜单的 dev | `http://127.0.0.1:4173/` | 启动它的终端按 Ctrl+C |
| CLI 使用手册 | 先 `npm run docs:install`，再 `npm run docs:dev` | `http://127.0.0.1:4174/` | 启动它的终端按 Ctrl+C |

服务启动后会持续占用该终端，这是正常现象。需要同时执行 CLI 检查时，再开一个终端；不要在已有服务器运行的同一终端继续输入命令。

## 确认结果

看到“今天想做什么？”以及 new、dev、check、publish 等选项，表示入口可用。接着阅读[认识菜单](/start/menu)。

## 影响与取消

不创建文章、不联网发布。npm link 是可选的本机环境变更；不需要管理员权限时不要加 sudo。

## 常见问题

如果显示 blog: command not found，先使用 npm run blog，并检查 npm 全局 bin 是否在 PATH 中。解除链接可在根目录运行 `npm unlink --global sachi-blog`。无交互终端显示帮助，不等待输入。

- `npm` 提示找不到 package.json：先确认当前目录，不在素材交接包或文章目录执行安装。
- 想在其他目录调用：注册简短入口后用 `blog --root "/你的项目绝对路径/sachi" doctor`。`--root` 指向项目，不是某篇文章。
- 没有 Git、Python 或 FFmpeg：先用纯文本写作；各功能的依赖见[环境检查](/start/doctor)，不要为使用菜单先配置服务器。

## 参数方式

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog
# 可选：注册本机命令
npm link
blog --help
```
