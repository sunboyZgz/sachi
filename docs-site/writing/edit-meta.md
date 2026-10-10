---
title: 修改文章信息
scope: local
files: 只修改选中元数据，保留正文
network: 不需要
online: 不改变
---

# 修改文章信息

## 什么时候用

想改标题、标签、摘要、封面或精选状态，但不想手动编辑 YAML 时使用。只改明确选中的字段，不重写正文。

## 开始前

决定要改哪篇文章。可选标题、标签、摘要、封面、状态、阅读分钟数、精选、未发布 slug。

## 操作步骤

1. 进入“查看或修改文章信息”，选择文章；手写文件不能解析时手动输入路径。

2. 先选“查看信息”确认身份；修改时再次进入并选“按字段修改”。

3. 空格勾选需要改的字段，Enter 继续。

4. 逐个输入：标签用中文或英文逗号分隔；精选选择是／否；分钟数输入正整数。

5. 当前值作为默认值，直接回车保留它。要清除可选字段，先删掉输入框中的默认内容，再提交空值；标题和 slug 不能留空。

6. 核对摘要并确认，再查看文章信息确认实际保存值。

### 例子：增加标签与摘要，再清除封面

以[本地教程](/start/local-workflow)创建的 `autumn-tea` 为例：

```sh
# 只看这篇文章的当前信息
npm run --silent blog -- meta autumn-tea --json
# 查看修改计划，还不写文件
npm run blog -- meta autumn-tea --set 'tags=[日常,记录]' --set 'summary=一杯茶的时间，一点日常的观察。' --dry-run
# 核对后执行，终端会再次要求确认
npm run blog -- meta autumn-tea --set 'tags=[日常,记录]' --set 'summary=一杯茶的时间，一点日常的观察。'
# 删除可选封面字段，先检查计划
npm run blog -- meta autumn-tea --set 'cover=null' --dry-run
```

`--set` 接受 YAML 值：`tags=[]` 是空标签数组，`featured=false` 是布尔值，`minutes=3` 是数字，`cover=null` 是删除字段，不是把字符串“null”写进封面地址。参数外层单引号用于防止终端把空格、方括号等拆开。摘要里含 `: ` 等 YAML 特殊字符时，值也要用 YAML 引号，例如 `--set 'summary="记录：今天的一杯茶"'`。

删除 `minutes` 会恢复自动计算；关闭精选用 `featured=false`，不靠删除正文实现。封面文件本身不会因清空 cover 被删除，但若正文还引用它，仍会随文章发布。

### 哪些字段不能在这里改

id 和 createdAt 只允许在接入手写文章时补齐缺失值，不是可反复重置的字段。栏目由目录决定；flow 可通过编辑 frontmatter 或合法的 `--set` 对象修改，复杂配置优先按[环绕教程](/writing/flow)操作。字段修改只影响本地，`featured`、`status` 都不是发布开关。

## 确认结果

返回 UPDATED。YAML 注释、未选字段、正文换行和尾随空格保留。

## 影响与取消

仅修改本地文章；公开内容不自动更新，需要[发布修订](/release/update)。确认默认取消。

## 常见问题

复杂 flow 不在字段菜单中，编辑 Markdown 或使用 --set。已发布文章不能改 slug。

## 参数方式

尖括号是占位符，应换成实际文章或目录，不要原样执行。未安装简短命令时用 `npm run blog --`；已安装时可替换成 `blog`。

```sh
npm run blog -- meta <文章>
npm run blog -- meta <文章> --set 'tags=[日常,记录]' --set 'featured=true' --dry-run
npm run blog -- meta <文章> --set 'summary=新的摘要' --yes
```
