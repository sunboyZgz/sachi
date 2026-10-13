import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '@/lib/markdown';
import { MarkdownContent } from './MarkdownContent';
import { ArticleProse } from './ArticleProse';
import { DesktopArticleToc, MobileArticleToc } from './ArticleToc';

const render = (markdown: string) => renderToStaticMarkup(createElement(MarkdownContent, { markdown }));

describe('Markdown reading controls', () => {
  it('distinguishes opening, stacked and separated headings while preserving preview source ranges', () => {
    const markdown = '## 开篇\n\n### **小节**\n\n第一段。\n\n## 第二章\n\n正文。';
    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown, sourceOrigin: { lineOffset: 8 } }));
    expect(html).toMatch(/<h2[^>]*id="开篇"[^>]*data-heading-context="opening"[^>]*data-heading-next="heading"[^>]*data-source-start="9"/);
    expect(html).toMatch(/<h3[^>]*id="小节"[^>]*data-heading-context="stacked"/);
    expect(html).toMatch(/<h2[^>]*id="第二章"[^>]*data-heading-context="section"/);
    expect(html).toContain('<strong>');
    expect(html).toContain('小节');
    for (const heading of parseMarkdown(markdown).headings) expect(html).toContain(`id="${heading.id}"`);
  });

  it('ignores invisible GFM and link definitions when spacing consecutive headings', () => {
    const html = render('[入口]: https://example.org/\n\n## [开篇][入口]\n\n[^注]: 说明。\n\n### 小节\n\n正文。');
    expect(html).toMatch(/<h2[^>]*data-heading-context="opening"[^>]*data-heading-next="heading"/);
    expect(html).toMatch(/<h3[^>]*data-heading-context="stacked"/);
    expect(html).toContain('<a href="https://example.org/">开篇</a>');
  });

  it('renders the same numbered hierarchy and native anchors in desktop and no-JS mobile contents', () => {
    const markdown = '# 篇章\n\n## 分节\n\n### 小节\n\n#### 说明\n\n## 分节';
    const { headings } = parseMarkdown(markdown);
    for (const component of [DesktopArticleToc, MobileArticleToc]) {
      const html = renderToStaticMarkup(createElement(component, { headings }));
      expect(html.match(/<li /g)).toHaveLength(5);
      expect(html).toContain('data-toc-level="2"');
      expect(html).toContain('01.1.1 · ');
      expect(html).toContain('01.2 · ');
      expect(html).toContain('data-toc-level="3"');
      expect(html).toContain('01.1.1.1 · ');
      expect(html).toContain('说明');
      for (const heading of headings) expect(html).toContain(`href="#${encodeURIComponent(heading.id)}"`);
    }
  });

  it('shows h1 to h4 as two contents levels while retaining the original h4 body and anchor', () => {
    const markdown = '# 章节\n\n#### **四级小节**\n\n#### 另一个小节';
    const { headings } = parseMarkdown(markdown);
    expect(headings.map(({ nesting }) => nesting)).toEqual([0, 1, 1]);
    expect(render(markdown)).toMatch(/<h4[^>]*id="四级小节"[^>]*class="article-heading"/);
    for (const component of [DesktopArticleToc, MobileArticleToc]) {
      const html = renderToStaticMarkup(createElement(component, { headings }));
      expect(html).toContain('01.1 · '); expect(html).toContain('01.2 · ');
      expect(html.match(/data-toc-level="1"/g)).toHaveLength(2);
      expect(html).toContain('style="--toc-level:1"');
      expect(html).not.toContain('data-toc-level="2"');
      expect(html).toContain(`href="#${encodeURIComponent('四级小节')}"`);
    }
    const deepest = parseMarkdown('# 一\n\n## 二\n\n### 三\n\n#### 四\n\n##### 五\n\n###### 六').headings;
    expect(deepest.at(-1)).toMatchObject({ depth: 6, nesting: 5, number: '01.1.1.1.1.1' });
    expect(renderToStaticMarkup(createElement(DesktopArticleToc, { headings: deepest }))).toContain('style="--toc-level:5"');
  });

  it('keeps the chapter after a flow intro separated from the intro, with matching nested anchors', () => {
    const body = '开篇文字。\n\n![图](./assets/shape.png)\n\n## 后文\n\n### 小节\n\n完整正文。';
    const parsed = parseMarkdown(body, { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 });
    const html = renderToStaticMarkup(createElement(ArticleProse, { parsed, assets: {}, flowKey: 'headings' }));
    expect(html).toMatch(/<h2[^>]*id="后文"[^>]*data-heading-context="section"/);
    expect(html).toMatch(/<h3[^>]*id="小节"[^>]*data-heading-context="stacked"/);
    expect(html).toContain('开篇文字。');
    expect(html).toContain('完整正文。');
    expect(parsed.headings[1]).toMatchObject({ id: '小节', number: '01.1', parentId: '后文' });
  });

  it('adds source markers only in previews, including inline syntax, table rows, media and exact code lines', () => {
    const markdown = '第一行 **强调**。\\\n::第二行。\n\n| 标题 |\n| --- |\n| 单元格 |\n\n![图](./assets/a.png)\n\n```ts\nconst one = 1;\nconst two = 2;\n```';
    expect(render(markdown)).not.toContain('data-source-');
    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown, sourceOrigin: { lineOffset: 8 } }));
    expect(html).toContain('data-source-line="9"');
    expect(html).toContain('data-source-line="10"');
    expect(html).toContain('data-source-kind="tableRow"');
    expect(html).toContain('data-source-kind="image"');
    expect(html).toContain('data-source-content-line="19"');
    expect(html.replace(/<[^>]+>/g, '')).toContain('const one = 1;\nconst two = 2;');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('\u2003\u2003第二行');
  });

  it('adds native, encoded permalinks to all six heading levels', () => {
    const html = render(Array.from({ length: 6 }, (_, index) => `${'#'.repeat(index + 1)} 中文标题 ${index + 1}`).join('\n\n'));
    for (let level = 1; level <= 6; level += 1) {
      expect(html).toContain(`<h${level} id="中文标题-${level}"`);
      expect(html).toContain(`href="#${encodeURIComponent(`中文标题-${level}`)}"`);
      expect(html).toContain(`aria-label="链接到标题：中文标题 ${level}"`);
    }
  });

  it('keeps duplicate and rich heading IDs aligned with the existing article contents', () => {
    const markdown = '## 重复 标题？\n\n第一段。\n\n## 重复 标题？\n\n## 用 **强调** 与 `代码` [阅读](https://example.org/)';
    const html = render(markdown);
    const headings = parseMarkdown(markdown).headings;
    expect(headings[1].id).toBe(`${headings[0].id}-1`);
    for (const heading of headings) {
      expect(html).toContain(`id="${heading.id}"`);
      expect(html).toContain(`href="#${encodeURIComponent(heading.id)}"`);
      expect(html).toContain(`aria-label="${heading.text}"`);
    }
    expect(html).toContain('<strong>强调</strong>');
    expect(html).toContain('<code>代码</code>');
    expect(html).toContain('<a href="https://example.org/">阅读</a>');
  });

  it('preserves the existing text-based anchors when headings contain images', () => {
    const markdown = '## 图 ![配图说明](./assets/a.png)\n\n## 图 ![另一张图](./assets/b.png)';
    expect(parseMarkdown(markdown).headings.map(({ id }) => id)).toEqual(['图-', '图--1']);
    const html = render(markdown);
    expect(html).toContain('id="图-"');
    expect(html).toContain('id="图--1"');
    expect(html).toContain(`href="#${encodeURIComponent('图--1')}"`);
  });

  it('enhances only code blocks while retaining exact code, escaping and no-JS server output', () => {
    const html = render([
      '行内 `inline`。',
      '```ts\n  const value = "<tag>&";\n\n  console.log(value);\n```',
      '```\nplain\n```',
      '    indented\n    second',
    ].join('\n\n'));
    expect(html.match(/class="code-block"/g)).toHaveLength(3);
    expect(html.match(/class="code-copy"[^>]*hidden=""[^>]*disabled=""/g)).toHaveLength(3);
    expect(html).toContain('<code>inline</code>');
    expect(html).toContain('<pre><code class="language-ts hljs">');
    expect(html.replace(/<[^>]+>/g, '')).toContain('  const value = &quot;&lt;tag&gt;&amp;&quot;;\n\n  console.log(value);\n');
    expect(html).toContain('<pre><code>indented\nsecond\n</code></pre>');
    expect(html).not.toContain('<tag>');
  });

  it('expands only an explicit paragraph-leading marker and keeps inline Markdown', () => {
    const html = render('::第一段 **强调**。\n\n:: 第二段有 [链接](https://example.org/::path)。\n\n普通段落的 :: 保持原样。\n续行的 :: 也保持原样。');
    expect(html).toContain('<p>\u2003\u2003第一段 <strong>强调</strong>。</p>');
    expect(html).toContain('<p>\u2003\u2003第二段有 <a href="https://example.org/::path">链接</a>。</p>');
    expect(html).toContain('普通段落的 :: 保持原样。');
    expect(html).toContain('续行的 :: 也保持原样。');
  });

  it('respects escapes, headings, code, longer colon runs, tables and image paragraphs', () => {
    const html = render([
      '\\::字面符号。', '&#58;&#58;字符实体。', '::: tip', '::::四个冒号。',
      '## ::标题', '`::行内代码`', '```text\n::代码\n```', '    ::缩进代码',
      '| 列 |\n| --- |\n| ::表格 |', '::![图](./assets/example.png)',
    ].join('\n\n'));
    expect(html).not.toContain('\u2003\u2003');
    expect(html).toContain('<p>::字面符号。</p>');
    expect(html).toContain('::字符实体。');
    expect(html).toContain('<code>::行内代码</code>');
    expect(html).toContain('::代码\n</code>');
    expect(html).toContain('::缩进代码\n</code>');
    expect(html).toContain('::: tip');
    expect(html).toContain('::表格');
  });

  it('combines a hard break and indentation without making a second paragraph', () => {
    const html = render('网站呈现的设计风格都符合个人喜好的博客工具。\\\n::可是，在过去如果不使用其他人的模版。\\\n:: **强调**仍然正常。\n\n::另一个段落。');
    expect(html.match(/<p>/g)).toHaveLength(2);
    expect(html.match(/<br\/>/g)).toHaveLength(2);
    expect(html).toContain('博客工具。<br/>\n\u2003\u2003可是');
    expect(html).toContain('<br/>\n\u2003\u2003<strong>强调</strong>');
    expect(html).toContain('<p>\u2003\u2003另一个段落。</p>');
    expect(render('第一行  \n::第二行。')).toContain('第一行<br/>\n\u2003\u2003第二行。');
  });

  it('keeps literal markers after soft breaks, escaped colons and inline content', () => {
    const html = render('第一行\n::软换行。\\\n\\::转义符号。\\\n&#58;&#58;字符实体。\\\n:::三个冒号。\\\n`::行内代码`。');
    expect(html).not.toContain('\u2003\u2003');
    expect(html).toContain('\n::软换行。');
    expect(html).toContain('<br/>\n::转义符号。');
    expect(html).toContain('<br/>\n::字符实体。');
    expect(html).toContain('<code>::行内代码</code>');
  });

  it('preserves compact breaks and full text in flow DOM fallback and server output', () => {
    const body = '第一行。\\\n::第二行。\n\n另一个段落。\n\n![图](./assets/shape.png)\n\n## 后文';
    const parsed = parseMarkdown(body, { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 });
    const html = renderToStaticMarkup(createElement(ArticleProse, { parsed, assets: {}, flowKey: 'hard-breaks' }));
    expect(html).toContain('<p>第一行。<br/>\u2003\u2003第二行。</p>');
    expect(html).toContain('<p>另一个段落。</p>');
    expect(html).toContain('flow-fallback');
  });
});


it('keeps global reference definitions and heading IDs when local flow blocks are replaced', () => {
  const markdown = '开头。\n\n![环绕][same]\n\n[same]: ./assets/a.png\n\n# 重复\n\n**普通段落**。\n\n![普通][same]\n\n# 重复';
  const parsed = parseMarkdown(markdown, { image: './assets/a.png', defaultX: .53, defaultY: 20 });
  const html = renderToStaticMarkup(createElement(ArticleProse, { parsed, assets: {}, flowKey: 'references' }));
  expect(html).toContain('alt="普通"');
  expect(html).toContain('src="/assets/a.png"');
  expect(html).toContain('id="重复"');
  expect(html).toContain('id="重复-1"');
  expect(html).not.toContain('[same]');
  expect(html).toContain('flow-ordinary-image');
});
