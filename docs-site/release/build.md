---
title: 本地构建与导出
scope: local
files: 冻结快照、代码、计划和构建包
network: 有部署配置时只读核实基线
online: 不改变
---

# 本地构建与导出

## 什么时候用

需要验证正式发布包或导出静态文件，但暂时不想上线时使用。构建结果与发布成功是不同状态。

## 开始前

文章检查通过，正式文章可被明确选择。有旧公开文章时需要可恢复的旧快照。

## 操作步骤

1. 进入“本地构建（不上线）”，空格勾选本次文章。

2. 先选择只看计划，确认保留与排除内容。

3. 重新进入并选择执行。决定是否额外导出 out：默认不导出。

4. 基线变化时核对提示，单独接受整站代码／配置更新。

5. 核对最终计划并确认，等待冻结、媒体转换、隔离构建与本地 HTTP 检查。

6. 查看 BUILD_ONLY、releaseId 与 directory。若导出，打开静态结果进行验收。

### 构建与看见结果

以 `autumn-tea` 为示例 slug，核对后执行以下流程：

```sh
npm run blog -- build autumn-tea --dry-run
npm run blog -- build autumn-tea --export
# 构建成功后，启动静态导出预览；用 4175 避开开发服务
npm run preview -- --port=4175
```

前两条在交互终端运行；第二条会要求确认，遇到基线变化先按[基线说明](/release/baseline)处理。只有 BUILD_ONLY 返回后才启动静态服务。在浏览器打开 `http://127.0.0.1:4175/article/autumn-tea/`；看完在启动预览的终端按 Ctrl+C。

这个预览只读 out，不会把它转换成已发布清单。不要直接双击 HTML 用 file:// 验收，根路径资源和路由需要 HTTP 服务。上面的地址适用于站点部署在 `/` 的情况；配置了 `/blog/` 等子路径时，静态服务器也必须映射该前缀，不能把资源 404 当成构建没有生成。

### 三种构建命令的区别

| 命令 | 内容来源 | 适用情况 |
| --- | --- | --- |
| `npm run blog -- build <文章>` | 旧公开集合 + 本次明确选择的新修订 | 验证即将公开的候选版本，默认仅保存私有包 |
| `npm run build` | 本地当前公开清单与持久快照 | 重新导出已发布网站；没有记录时为空站 |
| `npm run build:fixtures` | 排版样例 | 开发和视觉验收，不能作为正式上线包 |

`--export` 只增加一份 out 导出，不改变 BUILD_ONLY 状态。含 Pages 的包由[push](/setup/github-pages)交付；服务器单目标可用参数方式 `publish --resume <实际release-id>` 交付完整包，不使用会启用 Pages 解析的 push。待继续菜单不列 BUILD_ONLY，因此这种服务器交付要明确输入 ID。[冻结包继续方式](/release/resume)。

`publish <文章>` 会重新规划和冻结，不会自动选中刚才验收的包。包的 baseReleaseId 与服务器实际版本不同则会拒绝，不是可以任意用旧构建覆盖新网站。

## 确认结果

包位于 .blog-store/releases/&lt;release-id&gt;，只构建不改变服务器。--export 的旧 out 保留在 .blog/export-backups。

## 影响与取消

写持久快照与 BUILD_ONLY 记录；不做 Git 上传。已有 out 不会与新页面合并。

directory 指向整个私有包，不是可直接公开的目录。其中 `site/` 才是静态站点；code、snapshots、release.json 和 checksums.json 都不要交给静态服务。导出只复制站点，旧 out 备份路径以实际输出为准。

## 常见问题

一般 npm run build 只导出当前公开快照，无记录为空站；指定草稿验收请使用 blog build。build:fixtures 只用于视觉验收，不能正式部署。

## 参数方式

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog -- build <文章> --dry-run
npm run blog -- build <文章> --yes --export
```
