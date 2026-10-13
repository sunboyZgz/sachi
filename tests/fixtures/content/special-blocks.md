---
title: 特殊块排版样例
date: 2026-09-01
category: learn
fixture: true
featured: false
tags: [排版测试, Markdown]
summary: 集中查看公式、语法高亮、长代码、表格、引用、列表和脚注的实际阅读效果。
---

这一页集中展示公式、代码块、表格及其他 Markdown 特殊块。它使用文章的实际排版，可以从目录跳到相应小节，也可以缩窄窗口或打开打印预览，对照调整字号、颜色、留白与横向滚动。这里只是测试数据。

## 公式

### 行内公式与正文基线

中文正文中的 $E = mc^2$ 应与文字自然衔接；分式 $\frac{a+b}{c}$、根号 $\sqrt{x^2+y^2}$、下标 $x_i$ 和希腊字母 $\alpha + \beta$ 用来检查基线、行高与前后间距。

含公式的一段较长正文：当 $n \to \infty$ 时，我们关心 $a_n = \frac{1}{n^2}$ 的变化。窗口变窄后，公式仍与前后的文字一起阅读，不应盖住上一行或下一行。普通美元金额写成 \$5 与 \$10，行内代码 `$x + y$` 保持原样。

### 独立公式：分式、求和与积分

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

$$
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
\qquad
\int_0^1 x^2\,\mathrm{d}x = \frac{1}{3}
$$

### 矩阵、分段函数与多行对齐

$$
A = \begin{bmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{bmatrix}
\qquad
\mathbf{x} = \begin{pmatrix} x_1 \\ x_2 \\ x_3 \end{pmatrix}
$$

$$
f(x) = \begin{cases}
x^2, & x \geq 0 \\
-x, & x < 0
\end{cases}
$$

$$
\begin{aligned}
(a+b)^2 &= a^2 + 2ab + b^2 \\
(a-b)^2 &= a^2 - 2ab + b^2
\end{aligned}
$$

### 长公式与异常输入

下面的公式故意超过手机宽度，可以在公式区域内左右查看。

$$
\mathcal{L}(\theta) = \frac{1}{N}\sum_{i=1}^{N}\left(y_i - \theta_0 - \theta_1 x_{i,1} - \theta_2 x_{i,2} - \theta_3 x_{i,3}\right)^2 + \lambda\sum_{j=1}^{d}\theta_j^2
$$

下一条故意缺少右花括号，用来查看无效公式的原文降级；后续正文应继续完整显示。

$$
\frac{1}{
$$

公式之后的这句话用来确认错误不会吞掉后面的内容。

## 代码块

### JavaScript · js

```js
// 注释、关键词、字符串、数字和函数
const note = { title: '今天弄懂的一点东西', count: 42 };

function greet(name) {
  return `你好，${name} 🌿`;
}

console.log(greet(note.title));
```

### TypeScript · ts

```ts
interface Note { title: string; published: boolean }

const save = (note: Note): string => {
  return note.published ? note.title : '草稿';
};
```

### Python · py

```py
def average(values: list[float]) -> float:
    """保留原始缩进与空行。"""
    total = sum(values)

    return total / len(values) if values else 0.0

print(average([1, 2, 3]))
```

### Bash · sh

```sh
#!/usr/bin/env bash
# 检查终端命令与引号
for name in "第一篇" "第二篇"; do
  printf '%s\n' "$name"
done
```

### JSON

```json
{
  "title": "排版测试",
  "count": 12,
  "published": false,
  "tags": ["代码", "表格"]
}
```

### YAML · yml

```yml
title: 一页笔记
featured: false
tags:
  - 学习
  - 排版
flow:
  width: 205
```

### HTML

```html
<article class="note" data-count="3">
  <!-- HTML 字符只是代码，不会成为页面元素 -->
  <h2>标题 &amp; 说明</h2>
  <p>文本中的 &lt; 与 &gt;</p>
</article>
```

### CSS

```css
/* 颜色、属性与选择器 */
.note > p {
  color: #3f463f;
  line-height: 1.95;
  margin: 0 0 24px;
}
```

### Java

```java
public class Note {
    public static void main(String[] args) {
        String title = "一页笔记";
        System.out.println(title);
    }
}
```

### Go

```go
package main

import "fmt"

func main() {
    count := 3
    fmt.Printf("共 %d 篇笔记\n", count)
}
```

### Rust · rs

```rs
fn main() {
    let notes = vec!["问题", "例子", "体会"];
    for (index, note) in notes.iter().enumerate() {
        println!("{}: {}", index + 1, note);
    }
}
```

### 无语言、未知语言与缩进代码

不标语言时使用深灰色原文，不猜测语言。

```
理解工具解决的问题 -> 理解项目的宏观架构 -> 对比其他同类产品找到自己感兴趣的点

-> 理解这个点涉及的原理性知识 -> 阅读代码并复刻出小型 demo
```

未知语言也保留完整原文。

```unregistered-example
note => "这一行没有高亮定义"
count => 42
<标签> & 特殊字符
```

    缩进代码的第一行。
    第二行保持与第一行对齐。

### 长行与复制

这一行故意很长。代码区域可横向滚动，复制结果应保留缩进、空行和末尾换行。

```js
  const longMessage = "这是一条用来检查横向滚动的长字符串：代码保持在自己的矩形区域中，不会撑宽整个页面；中文、英文、数字 0123456789，以及 <tag> & 字符都应完整保留。";

  console.log(longMessage);
```

## 表格

### 对齐与混合内容

| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| 普通中文 | **强调** | 128 |
| `inline_code` | $x^2$ | 3.14159 |
| [页内链接](#公式) | ~~旧方案~~ | -42 |
| 空单元格 → | | 0 |
| 转义竖线 a\|b | emoji 🌿 | 1000 |

### 多列与长内容

下面的表格有较多列。手机上允许在表格区域内横向滚动，正文仍保持正常宽度。

| 项目 | 说明与较长文字 | 语言 | 输入 | 输出 | 状态 | 耗时 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 正文 | 中文、英文 Mixed text 和自动换行 | Markdown | 段落 | DOM | 完整 | 12 ms | 行距检查 |
| 公式 | 分式、矩阵与积分符号的组合 | LaTeX | $\frac{1}{2}$ | $0.5$ | 完整 | 8 ms | 基线检查 |
| 代码 | 包含字符串、关键词与注释的程序片段 | TypeScript | `const n = 42` | `42` | 完整 | 3 ms | 高亮检查 |
| 长标识符 | very_long_identifier_without_spaces_0123456789_abcdefghijk | JSON | `{}` | `[]` | 完整 | 1 ms | 宽度检查 |

## 引用与列表

> 一段普通引用，用来检查苔绿文字与左侧竖线。
>
> 引用中的第二段包含 **强调**、`行内代码` 与公式 $a^2+b^2=c^2$。
>
> > 嵌套引用再往内缩进一级。

- 无序列表第一项。
- 第二项含有一段更长的文字，窗口变窄时应保持悬挂缩进，续行与项目文字对齐。
  - 嵌套列表含 **强调**。
  - 第二个子项含 `code`。

1. 有序列表第一项。
2. 第二项包含独立段落。

   这一段仍属于第二项，用来检查段落之间的留白。

   ```py
   print("列表中的代码块")
   ```

- [x] 已完成的任务。
- [ ] 未完成的任务。
- [ ] 检查移动端、打印和无 JavaScript 阅读。

## 文字、分隔线与脚注

普通文字、**粗体**、*斜体*、~~删除线~~、`行内代码` 和 [同页公式链接](#公式) 放在同一行，便于比较色彩与字重。转义符号 \*星号\*、字符实体 &amp; 与 &lt;tag&gt; 应显示为文字。

::这一段有两个字宽的首行缩进。文字足够长时，会自然换行，后续行回到正常起点，不会继承首行缩进。

第一行是紧凑换行。\
::第二行在同一段落里缩进两个字。

---

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

脚注引用放在段落末尾，用来检查上标与回到正文的链接。[^layout]

![普通图片与图片说明](./assets/tea-cup.webp)

这一页的正文到这里结束。

[^layout]: 这是一条排版测试脚注，包含 `inline_code` 和公式 $\sqrt{2}$。脚注不是文章署名。
