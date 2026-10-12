---
title: 第一次完整本地写作
scope: local
files: 创建文章和本地构建包
network: 不需要
online: 不改变
---

# 第一次完整本地写作

## 什么时候用

先走通一篇文章从新建到本地预览的完整过程。此流程不配置服务器，不提交 Git，也不公开草稿。

## 开始前

完成[准备环境](/start/install)。Git 和部署可保持未配置，本教程不需要公网服务器。

## 操作步骤

1. 打开菜单选择“新建文章”，选择“生活旁白”，输入“秋天的一杯茶”，记下返回路径。

   ```sh
   npm run blog -- new --category life --title "秋天的一杯茶" --slug autumn-tea
   ```

   记下真实 file 与 id；autumn-tea 已存在时换一个 slug。

2. 用编辑器打开该 index.md，替换模板正文，保留生成的 ID 和创建时间。

3. 把图片放入同级 assets，按[图片教程](/writing/images)写相对路径。

4. 再次打开菜单选择“检查 Markdown 与资源”，选择这篇文章并处理问题。

   ```sh
   npm run blog -- check autumn-tea
   ```

   VALID 表示当前正文与资源检查通过。

5. 选择“预览首页或文章”，选择文章，在浏览器打开输出地址。看完按 Ctrl+C 停止预览。

   ```sh
   npm run blog -- dev --post autumn-tea
   ```

   打开输出的 4173 预览地址；看完在该终端按 Ctrl+C。

6. 选择“本地构建”，勾选这篇文章，先看计划。重新进入相同操作，选择执行并确认，暂不导出 out。

   ```sh
   npm run blog -- build autumn-tea --dry-run
   ```

   先核对 PLANNED，再去掉 --dry-run 执行；BUILD_ONLY 仍未上线。

### 可照着完成的一篇文章

如果希望示例中的命令都使用同一个可读名称，可用以下方式新建；此名称已存在时换一个 slug，不能重复使用：

```sh
npm run blog -- new --category life --title "秋天的一杯茶" --slug autumn-tea
```

输出中的 `file` 才是实际路径。例如在 2026-10-06 创建会生成 `content/生活旁白/2026-10-06/index.md`，同日已有文章则可能是 `2026-10-06-02`。打开这份文件，保留开头两条 `---` 之间的身份信息，把模板正文替换为：

```markdown
今天给自己留了一杯茶的时间。

## 一点观察

把刚刚发生的小事写下来，不急着给它一个结论。

## 下次再试

- 再读一遍今天的记录。
- 留下一个想继续追问的问题。
```

生成效果是开篇段落、两个二级标题和列表；文章目录会链接到这两个标题，标题旁的小节链接可以定位。没有图片也可以完成本教程；需要图片时再按[图片示例](/writing/images)添加，不保留不存在的资源路径。

保存后在另一个终端检查，再启动预览：

```sh
npm run blog -- check autumn-tea
npm run blog -- dev --post autumn-tea
```

等服务器就绪，打开 `http://127.0.0.1:4173/article/autumn-tea/`，确认文字、标题和目录一致。这个终端继续运行服务器；看完按 Ctrl+C。接着核对并构建：

```sh
npm run blog -- build autumn-tea --dry-run
npm run blog -- build autumn-tea
```

第二条会要求执行确认。如果已有旧发布且提示全站基线变化，先读[基线说明](/release/baseline)，不要直接忽略它。最后看到 BUILD_ONLY 和实际 releaseId 才表示构建完成；记下它，后续可以[推送这个冻结包](/setup/github-pages)，不必重新选择当前新稿。

## 确认结果

检查返回 VALID；构建返回 BUILD_ONLY 和私有包目录，文章仍未上线。下一步可[配置部署](/setup/server)，但不是写作前提。

## 影响与取消

写入文章和 .blog-store 中的本地包；不提交 Git，不改变公开网站。

## 常见问题

列表为空时先确认新文章创建成功。排版样例不能正式发布，不要把 BUILD_ONLY 当作 DEPLOYED。

初次本地 build 不会建立“已经公开”的清单，所以这时运行 `npm run build` 仍可能输出空站。它与 `blog build autumn-tea` 的用途不同，见[构建与导出](/release/build)。

## 参数方式

本页步骤旁已给出对应写法与结果说明。完整参数可在[命令索引](/reference/commands)按操作名查看；示例占位符请换成实际值，已安装简短命令时可把 `npm run blog --` 换成 `blog`。
