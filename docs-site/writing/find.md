---
title: 查找文章与系列 ID
scope: local
files: 不修改文件
network: 不需要
online: 不改变
---

# 查找文章与系列 ID

## 什么时候用

记得中文名称，却不记得 UUID 或目录时使用。搜索列出候选，后续修改由传入完整 ID 的命令负责。

## 开始前

在博客根目录打开终端。本页沿用[系列教程](/writing/series)的“朝思暮想的玩具”和“我学会了”，教学 UUID、日期以实际输出替换。

## 操作步骤

### 1. 输入文章标题的一部分

```sh
npm run blog -- search "朝思暮想"
```

示例输出直接给出可复制 ID：

```text
文章搜索：朝思暮想
匹配 1 项：
朝思暮想的玩具 · 闲暇娱乐
  ID：51f3e126-f6a0-4ef3-a4fb-6dca72b85afd
  文件：.blog-store/content/闲暇娱乐/2026-10-12/index.md
```

同名文章分别列出，核对栏目和路径再复制。已归组的文章还会显示系列 ID 和章节序号。

### 2. 用多个关键词缩小候选

关键词放在同一对引号中，用空格分隔。下面要求名称同时匹配“博客”和“玩具”，不要求它们紧挨：

```sh
npm run blog -- search "博客 玩具"
```

完整名称优先，其次包含关键词，再按模糊相关度排序；同分按文件路径稳定排列。轻微错字也能匹配，例如“查找系列工俱”可匹配“查找系列工具”。仍由你核对候选，不自动采用第一项；不支持拼音或首字母检索。

### 3. 查系列名称

系列使用相同的中文匹配规则：

```sh
npm run blog -- series search "我学会了"
```

示例输出：

```text
系列搜索：我学会了
匹配 1 项：
我学会了 · 闲暇娱乐
  ID：a712a8ac-2c18-4520-9428-96a45b566ce1
  文件：.blog-store/content/series/a712a8ac-2c18-4520-9428-96a45b566ce1.yaml
```

文章与系列各有独立身份，同名系列可能属于不同栏目。需要新建时按[系列教程](/writing/series)操作，创建成功会输出新 ID。

### 4. 复制 ID，明确执行后续操作

占位符换成刚查到的实际值，可以查看资料，或预演系列插入：

```sh
npm run blog -- meta <文章ID>
npm run blog -- series add <文章ID> --series <系列ID> --order 2 --dry-run
```

插入只接受完整 ID；meta 既有的 slug 和文件路径用法仍保留。名称检索不会隐式选定修改对象。

### 5. 需要结构化结果时使用现有 JSON

默认输出适合查看和复制，JSON 可查看完整结果：

```sh
npm run --silent blog -- search "朝思暮想" --json
```

成功对象含 `command: "search"`、`status: "READ"`、`data.query`、`data.matches` 和 `data.issues`；匹配项含 id、title、category、file。`--silent` 去掉 npm 提示，不改变 CLI 结果。

## 确认结果

找到时显示全部匹配候选；没找到显示“没有匹配结果”，可尝试更短或不同关键词。查询不创建系列或修改文章。

## 影响与取消

只读本地正式内容库，不联网、不写索引缓存、不检查正文资源。正文、flow 或图片未完成时，只要身份和名称可读取就能查到。兼容旧 `content/*.md` 的稳定 legacy ID，不把 fixture 当正式文章。

## 常见问题

- **空查询**：交互菜单要求输入；非交互和 JSON 返回 INPUT_REQUIRED，不默认列出所有文章。
- **读取问题**：结果列出坏 YAML、缺身份、重复 ID 或不安全路径。修复后再查；其他可读取候选仍显示。
- **错字命中很多**：增加关键词并核对栏目和路径。
- **线上有、本地没有**：搜索只查本地原稿，先通过现有恢复流程找回源文件。

## 参数方式

完整参数见[search 命令](/reference/commands/search)和[series 命令](/reference/commands/series)。没有“只输出 ID”开关，也不自动串联创建与归组。
