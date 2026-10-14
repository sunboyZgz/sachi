import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from '../components/MarkdownContent';
import { ArticleProse } from '../components/ArticleProse';
import { parseMarkdown } from './markdown';

const render = (markdown: string, type?: 'article' | 'poem', sourceOrigin?: { lineOffset: number }) => renderToStaticMarkup(createElement(MarkdownContent, { markdown, type, sourceOrigin }));

describe('poetry Markdown and exact source positions', () => {
  it('turns source lines into breaks and blank lines into stanzas without rewriting source', () => {
    const body = '第一行诗\n第二行诗\n\n第三行诗\n第四行诗';
    const html = render(body, 'poem');
    expect(html.match(/class="poem-stanza"/g)).toHaveLength(2);
    expect(html.match(/<br\/>/g)).toHaveLength(2);
    expect(html).toContain('第一行诗<br/>\n第二行诗');
    const parsed = parseMarkdown(body, undefined, {}, undefined, { type: 'poem' });
    expect(parsed.markdown).toBe(body); expect(parsed.description).toBe('第一行诗 第二行诗');
    expect(render(body)).not.toContain('<br/>');
    expect(render(body, 'article')).toBe(render(body));
    expect(renderToStaticMarkup(createElement(ArticleProse, { parsed, assets: {}, flowKey: 'poem' }))).toContain('article-prose--poem');
  });
  it('preserves rich inline syntax across verse boundaries, explicit breaks and encoded entities', () => {
    const body = '**第一行\n第二行**\n[第三行](https://example.org) 与 `行内代码`\n第四行 &amp; 😀\\\n第五行  \n第六行';
    const html = render(body, 'poem');
    expect(html).toContain('<strong>第一行<br/>\n第二行</strong><br/>');
    expect(html).toContain('<a href="https://example.org">第三行</a>');
    expect(html).toContain('<code>行内代码</code>');
    expect(html.match(/<br\/>/g)).toHaveLength(5);
    expect(render('同一行&#10;仍在同一行', 'poem')).not.toContain('<br/>');
  });
  it('protects code, math, lists, quotes, tables and media from poetry line conversion', () => {
    const blocks = ['```text\n代码第一行\n代码第二行\n```', '> 引用第一行\n> 引用第二行', '- 列表第一行\n  列表第二行', '| 表头 |\n| --- |\n| 表格 |', '![图](./assets/image.png)', '$$\nx+y\n$$'];
    for (const block of blocks) expect(render(block, 'poem')).toBe(render(block));
    expect(render('第一行 `内联\n代码`\n第二行', 'poem').match(/<br\/>/g)).toHaveLength(1);
  });
  it('retains original coordinates in CRLF, entities, repeated words and multiline emphasis', () => {
    const body = '前行 &amp; 重复😀\r\n**重复\r\n末行**\r\n最后一行';
    const html = render(body, 'poem', { lineOffset: 12 });
    for (const line of [13, 14, 15, 16]) expect(html).toContain(`data-source-line="${line}"`);
    expect(html).toContain('data-source-start-column="3"');
    expect(html).toContain('data-source-map="[[14,3],[14,4],[14,5]]"');
    expect(html).toContain('[13,4],[13,9]');
    expect(html.match(/<br\/>/g)).toHaveLength(3);
    expect(render(body, 'poem')).not.toContain('data-source-');
    expect(parseMarkdown('# 第一章\n\n诗句\n另一行\n\n#### 末章', undefined, {}, undefined, { type: 'poem' }).headings).toEqual(parseMarkdown('# 第一章\n\n诗句\n另一行\n\n#### 末章').headings);
  });
  it('rejects conflicting flow in strict rendering and retains the full poem in tolerant preview', () => {
    const body = '第一行\n第二行\n\n![图](./assets/a.png)';
    const flow = { image: './assets/a.png', defaultX: .5, defaultY: 20 };
    expect(() => parseMarkdown(body, flow, {}, undefined, { type: 'poem' })).toThrow('诗歌模式暂不支持 flow');
    const parsed = parseMarkdown(body, flow, {}, undefined, { type: 'poem', tolerant: true });
    expect(parsed.flows).toEqual([]); expect(parsed.markdown).toBe(body); expect(parsed.warnings).toHaveLength(1);
  });
});
