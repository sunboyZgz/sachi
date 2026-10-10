---
title: 组织系列文章
scope: local
files: 创建或修改系列 YAML 与文章元数据；发布时冻结系列快照
network: 写作不需要；发布使用已配置目标
online: 保存不会上线；发布章节时同步更新所属系列介绍
---

# 组织系列文章

## 什么时候用

多篇文章需要按章节顺序阅读时使用。栏目继续按时间逐篇归档，系列目录另按序号组织；每篇最多归属一个系列，整个系列属于同一栏目。

## 开始前

确定系列名称和所属栏目。系列目录使用纯文字列表，简介为可选纯文字；第一篇公开后才生成公开目录。系列身份和文章身份各自独立。

## 操作步骤

1. 在主菜单进入“系列管理”，选择新建系列，填写栏目、名称与可选简介。资料存入 `content/series/<UUID>.yaml`。
2. 新建文章时选择同栏目的系列并确认章节序号。默认建议本地与已发布章节的最大序号加一。
3. 修改文章信息时选择“所属系列与章节顺序”，可以调整序号、加入另一个同栏目系列，或选择退出系列。
4. 运行 check 和本地预览。文章标题下的系列链接通向目录；正文结束后自动提供相邻章节和系列目录。
5. 查看发布计划。选中章节会同步采用所属系列当前名称和简介；未选文章保留旧快照，其他系列的本地修改不纳入。
6. 确认后发布。新增章节会更新旧章节的导航，无需修改旧章正文。只改介绍时，可明确选择系列资料单独发布。

序号允许间隔，不要求重新编号。公开目录只列公开章节，不显示草稿名称、草稿数量或待更新条目。撤回章节后导航跳过它；最后一篇撤回后系列目录不再导出，资料及历史快照保留。

文章字段示意（保留 new 生成的其他元数据）：

```yaml
series:
  id: <实际系列UUID>
  order: 2
```

系列资料包含 id、slug、title、category、可选 description。名称可改；已发布的 slug 固定。正文可使用 `[系列目录](series:<实际系列UUID>)` 或 `/series/<实际slug>/`，发布时目标必须有公开章节。

## 确认结果

文章与系列栏目一致、序号无冲突。公开 `/series/<slug>/` 按实际章节序号排序；未选草稿不在目录或前后篇导航中。目录页、文章链接及手机导航均可直接使用。

## 影响与取消

写作取消和 dry-run 不创建文件。保存介绍只影响本地；发布该系列章节时介绍会一同上线，并列入计划。恢复冻结计划不读取后续介绍修改；备份、恢复和回滚包含系列资料。不会自动初始化根 Git 仓库。

## 常见问题

- 编号重复：本地和候选公开集合分别校验。交换两篇的编号后需一起发布，避免与未选旧快照冲突。
- 系列目录不存在：至少一篇章节需在公开集合中，未发布的系列资料不会生成公开页面。
- 只更新介绍：使用 build/publish 的 --series；不需要重发文章正文。
- 旧文章：无 series 字段时行为不变，标题和标签不会自动转换成系列归属。

## 参数方式

示例名称和 slug 仅供参考；UUID、章节身份需替换为实际创建结果。

```sh
npm run blog -- series new --category learn --title "学习札记" --slug learning-notes
npm run blog -- series list --json
npm run blog -- new --category learn --title "从一个问题开始" --series learning-notes
npm run blog -- new --category learn --title "让例子运行起来" --series learning-notes --order 2
npm run blog -- series meta learning-notes --set 'description=按章节记录学习过程。'
npm run blog -- meta <文章> --set 'series=null'
npm run blog -- build <章节> --dry-run
npm run blog -- build --series learning-notes --dry-run
npm run blog -- publish --series learning-notes --dry-run
```
