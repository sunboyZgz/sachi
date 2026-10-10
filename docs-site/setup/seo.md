---
title: 配置与检查 SEO
scope: local
files: blog.config.json、src/config/profile.json 和构建产物
network: 本地验收不需要；线上收录验证需要正式域名
online: 明确发布后才改变
---

# 配置与检查 SEO

## 什么时候用

准备部署正式博客，设置正确的搜索地址和分享信息，或检查文章是否进入站点地图。

## 开始前

已有自己实际使用的正式站点根地址。没有域名时保留 `siteUrl: null`，不要照抄示例域名。SEO 不保证搜索排名或立即收录。

## 操作步骤

1. 打开根目录 `blog.config.json`，把 `siteUrl` 设成实际 HTTP(S) 站点地址，例如 `https://你的域名`；允许 `/blog/` 这样的站点子路径，但不能带查询参数、账号或密码。[GitHub Pages](/setup/github-pages) 发布包会自动采用目标仓库的官方 URL，保留仓库名子路径，不需要伪造或购买域名。

2. 打开 `src/config/profile.json`，核对作者名、简介；`seo.description` 可填写全站摘要，`null` 时使用简介。

3. 默认 `seo.allowIndexing: true` 表示允许正式发布站收录。若整个站还不想被收录，设为 `false` 并重新构建发布。这个开关不是密码保护，不应靠它保密。

4. 编辑文章的 `summary` 和可选 `cover`。摘要未填写时从 Markdown 正文提取；分享图片优先使用本篇封面，没有封面时使用现有创作桌面图。图片必须是本篇本地资源，避免引用会变化的外部封面。

5. 按[发布选中文章](/release/publish)查看并确认计划。域名、个人信息都属于全站基线；已经有发布记录时，必须另行明确接受基线变更。

6. 本地构建后检查 `out/sitemap.xml` 和 `out/robots.txt`，并查看文章 HTML 中的 canonical、Open Graph、Twitter 和 `application/ld+json`。canonical 必须是正式 `/article/<slug>/`，而不是 `/versions/<发布ID>/`。

7. 核对站点地图：只包含正式导出中的公开文章、目录和非空栏目分页；不含草稿、fixture、404、空栏目或 `__empty__` 哨兵页。页码各自指向自己的 canonical，不都指回第一页。

8. 部署后再访问正式域名的 `sitemap.xml` 和 `robots.txt`。可用搜索引擎站长平台提交站点地图，并验证结构化数据；本地成功不代表公网或搜索引擎已经收录。

### 从哪里查看生成的 SEO

`blog build` 默认不写 out。需要按上面的路径检查时，明确执行 `blog build <文章> --export`；如果检查已经发布的版本，使用 `npm run build` 导出当前公开快照。输出目录不要与开发页面混淆。

打开 `out/article/<实际slug>/index.html` 的源码，搜索 `canonical`、`og:`、`twitter:` 和 `application/ld+json`。也可通过静态 HTTP 预览打开该页，再查看页面源代码；不是只在可见正文中寻找这些元信息。

按以下对照核验：

| 项目 | 应与什么一致 | 常见错误 |
| --- | --- | --- |
| canonical / 分享 URL | 正式站点根 + 实际文章 slug | 使用 localhost、旧域名或版本化资源前缀 |
| 标题 / 摘要 | 本篇冻结 title / summary 与公开个人配置 | 改了本地新稿却没重新发布 |
| 分享图片 | 本篇冻结 cover，或共享默认插画 | 原始相对路径、缺少 Pages 仓库前缀 |
| BlogPosting 时间 | 清单中的首次发布 / 更新记录 | 把本地创建日期当上线时间 |
| sitemap | 本次真正导出的公开集合 | 期待未选草稿出现，或把 fixture 构建上线 |

Pages 的免费 URL 包含仓库子路径时，访问的是 `https://OWNER.github.io/REPO/sitemap.xml`，不是个人根地址的 sitemap。正式 Pages 地址由目标推送自动派生，OWNER / REPO 换成实际值。

### 上线后仍 noindex，按这个顺序查

先核对访问的是正式站点而不是 4173 开发预览；再查 release-marker 是否为本次版本，然后核对冻结的 siteUrl、allowIndexing 与实际 HTML。修改当前配置后仅刷新旧公开页不会生效，需要明确发布新基线。SEO 验收依赖网页内容与部署状态，不以“过了几分钟”作为成功标准。

## 确认结果

- 正式发布且域名已配置：正常页面允许索引，有准确 canonical；文章包含 `BlogPosting`、作者、首次发布时间和本次更新时间、面包屑。
- 开发、fixture 构建、未设置域名：页面 `noindex`，不生成伪造域名的 canonical 或站点地图条目。
- 404、无效分页和空栏目：不收录。
- `robots.txt` 允许抓取页面和渲染资源，以便爬虫能读取页面上的 `noindex`，不把禁止抓取误当作禁止索引。

## 影响与取消

`siteUrl` 和个人 SEO 配置随全站代码一起冻结。改动不会悄悄覆盖正在执行的计划；回滚保留旧版域名和资料。不要上传整个项目，只部署导出的静态站。

## 常见问题

- 本地没有 canonical：预览模式主动不提供正式地址，属于预期。
- 站点地图没有文章：确认文章已经正式选中发布；fixture 和未选草稿不会导出。
- 域名还是旧的：恢复旧计划使用旧配置；修改配置需要新的全站基线计划。
- 只改 robots 就能保密吗：不能。`noindex` 也不是权限控制；草稿依靠发布隔离而非爬虫规则保护。[Google 的 noindex 说明](https://developers.google.com/search/docs/crawling-indexing/block-indexing)解释了它与禁止抓取的区别。
- 发布时间为什么不是 createdAt：正式 SEO 使用成功发布清单中的首次发布时间和更新时间，不把本地写作时间当上线时间。[文章结构化数据说明](https://developers.google.com/search/docs/appearance/structured-data/article)。

## 参数方式

```sh
npm run check
npm run test:cli:next
npm run build
```

真实 Next 构建测试在临时目录完成，不提交 Git、不连接或写入真实服务器。`npm run build` 只采用当前已发布快照；没有记录时生成空站。
