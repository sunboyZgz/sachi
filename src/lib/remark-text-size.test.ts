import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from '../components/MarkdownContent';
import { ArticleProse } from '../components/ArticleProse';
import { markdownReferences } from './blog/document';
import { parseMarkdown } from './markdown';
import { formatMarkdownSpacing } from '../../tools/blog-cli/format';

const render = (markdown: string, sourceOrigin?: { lineOffset: number }, type?: 'poem') => renderToStaticMarkup(createElement(MarkdownContent, { markdown, sourceOrigin, type }));

describe('inline text size syntax shared by the blog and previews', () => {
  it('changes only paired text, including Chinese-adjacent markers and rich inline children', () => {
    const html = render('普通++放大 **强调** 与 [链接](https://example.org)++普通--缩小 *斜体*--。');
    expect(html).toContain('<span class="markdown-text-larger">放大 <strong>强调</strong>');
    expect(html).toContain('<a href="https://example.org">链接</a></span>普通');
    expect(html).toContain('<span class="markdown-text-smaller">缩小 <em>斜体</em></span>');
    expect(render('++放大 --缩小--++')).toContain('<span class="markdown-text-larger">放大 <span class="markdown-text-smaller">缩小</span></span>');
    expect(render('**++强调++** ~~--删除--~~')).toContain('<strong><span class="markdown-text-larger">强调</span></strong>');
    expect(render('[++链接名++](https://example.org)')).toContain('<a href="https://example.org"><span class="markdown-text-larger">链接名</span></a>');
  });

  it('applies positive decimal factors as multiplication or division of surrounding font size', () => {
    const html = render('++双倍++{2}、--一半--{2}、++小数++{1.5}、--五分之四--{1.25}、++半倍++{.5}。');
    expect(html).toContain('class="markdown-text-larger" style="font-size:2em">双倍');
    expect(html).toContain('class="markdown-text-smaller" style="font-size:0.5em">一半');
    expect(html).toContain('style="font-size:1.5em">小数');
    expect(html).toContain('style="font-size:0.8em">五分之四');
    expect(html).toContain('style="font-size:0.5em">半倍');
    expect(html).not.toContain('{2}');
    expect(render('++大 --小--{2}++{2}')).toContain('style="font-size:2em">大 <span class="markdown-text-smaller" style="font-size:0.5em">');
    expect(parseMarkdown('++摘要++{2}，--小字--{3}').description).toBe('摘要，小字');
    expect(render('`++代码++{2}` $++x++{2}$')).not.toContain('markdown-text-');
    expect(formatMarkdownSpacing('中文++AI++{2}文字').body).toBe('中文 ++AI++{2} 文字');
  });

  it.each(['{0}', '{-2}', '{NaN}', '{Infinity}', '{2px}', '{1.2.3}', '{ 2 }', '{2', '{1e3}'])('preserves an invalid or unfinished factor as visible text: %s', (factor) => {
    const html = render(`++原文++${factor} --小字--${factor}`);
    expect(html).not.toContain('style="font-size:');
    expect(html).toContain(factor);
    expect(html).toContain('原文'); expect(html).toContain('小字');
  });

  it('only consumes a factor after a matching closing delimiter and preserves exact offsets', () => {
    expect(render('++{2}未完成')).not.toContain('markdown-text-');
    expect(render('++{2}开头++')).toContain('class="markdown-text-larger">{2}开头');
    expect(render('++文字++\\{2}')).toContain('</span>{2}');
    const html = render('++大 &amp;++{2}尾\r\n--小字--{1.5}后', { lineOffset: 5 });
    expect(html).toContain('data-source-map="[[6,3],[6,4],[6,5],[6,10]]"');
    expect(html).toContain('data-source-map="[[7,3],[7,4],[7,5]]"');
    expect(html).toContain('data-source-start-column="15"');
    expect(html).toContain('data-source-start-column="12"');
  });

  it.each([
    '尚未++完成', '尚未--完成', '++跨行\n文字++', '--跨行\r\n文字--',
    '++ 留空 ++', '-- 留空 --', '++++', '----', '+++文字+++', '---文字---',
    'C++ 与 C++', 'a--b--c', 'foo++bar++baz', '\\+\\+字面\\+\\+', '\\-\\-字面\\-\\-', '\\++字面\\++', '\\--字面\\--',
    '&#43;&#43;字符实体&#43;&#43;', '&#45;&#45;字符实体&#45;&#45;',
  ])('keeps incomplete, escaped, multiline or non-delimiter sequences readable: %s', (body) => {
    const html = render(body);
    expect(html).not.toContain('markdown-text-larger'); expect(html).not.toContain('markdown-text-smaller');
  });

  it('protects native code, formulas, link destinations and Markdown block syntax', () => {
    const html = render('`++代码++ --参数--`\n\n```text\n++代码块++ --参数--\n```\n\n$++x++$\n\n[网址](https://example.org/a--b--c)\n\nhttps://example.org/a--b--c\n\n---\n\n- 普通列表');
    expect(html).not.toContain('markdown-text-');
    expect(html).toContain('<code>++代码++ --参数--</code>');
    expect(html).toContain('<hr/>'); expect(html).toContain('<li>普通列表</li>');
    expect(html).toContain('href="https://example.org/a--b--c"');
    expect(render('![++图片替代文本++](./assets/a.png)')).not.toContain('markdown-text-');
  });

  it('works in lists, quotes, tables and poem lines without adding headings or changing body source', () => {
    const body = '- ++列表++\n\n> --引用--\n\n| 表头 |\n| --- |\n| ++表格++ |';
    const html = render(body);
    expect(html.match(/markdown-text-larger/g)).toHaveLength(2);
    expect(html.match(/markdown-text-smaller/g)).toHaveLength(1);
    const poem = '++诗行一++\n--诗行二--';
    expect(render(poem, undefined, 'poem')).toContain('</span><br/>\n<span class="markdown-text-smaller">');
    expect(parseMarkdown(poem).markdown).toBe(poem);
    expect(parseMarkdown('# ++标题++\n\n--正文--').headings[0]).toMatchObject({ text: '标题', id: '标题', depth: 1 });
    expect(parseMarkdown('++正文 **强调**++与--小字--').description).toBe('正文 强调与小字');
  });

  it('retains exact original positions after delimiters, entities and CRLF for reverse navigation', () => {
    const body = '前言++放大 &amp; 😀++结尾\r\n--第二行--';
    const html = render(body, { lineOffset: 10 });
    expect(html).toContain('data-source-map="[[11,5],[11,6],[11,7],[11,8],[11,13],[11,14],[11,15],[11,16]]"');
    expect(html).toContain('data-source-map="[[12,3],[12,4],[12,5],[12,6]]"');
    expect(render(body)).not.toContain('data-source-');
  });

  it('treats sized text as rich text at flow boundaries and preserves the full paragraph', () => {
    const body = '纯文本环绕。\n\n![图](./assets/a.png)\n\n++放大段落++与--缩小段落--。\n\n后续正文。';
    const parsed = parseMarkdown(body, { image: './assets/a.png', width: 180, defaultX: .5, defaultY: 20 });
    expect(parsed.flows).toHaveLength(1); expect(parsed.flows[0].paragraphs).toEqual(['纯文本环绕。']);
    const html = renderToStaticMarkup(createElement(ArticleProse, { parsed, assets: {}, flowKey: 'size' }));
    expect(html).toContain('markdown-text-larger'); expect(html).toContain('放大段落'); expect(html).toContain('后续正文');
  });

  it('keeps resource scanning and the CLI spacing formatter consistent with rendered syntax', () => {
    expect(markdownReferences('++[文章](post:article-id)++\n\n--[下载](./assets/a.pdf)--')).toEqual(['./assets/a.pdf', 'post:article-id']);
    const source = '中文++AI++改变世界，--使用AI工具--。 `++使用AI++`';
    const formatted = formatMarkdownSpacing(source);
    expect(formatted.body).toBe('中文 ++AI++ 改变世界，--使用 AI 工具--。 `++使用AI++`');
    expect(formatMarkdownSpacing(formatted.body).insertedSpaces).toBe(0);
    expect(render(formatted.body).match(/markdown-text-larger/g)).toHaveLength(1);
  });
});
