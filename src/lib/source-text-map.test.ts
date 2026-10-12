import type { Code, InlineCode, Root, Text } from 'mdast';
import { unified } from 'unified';
import parse from 'remark-parse';
import gfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';
import { remarkFirstLineIndent } from './remark-first-line-indent';
import { createSourceMapper, joinSourceMaps, normalizeSourceMap, sliceSourceMap } from './source-text-map';
import { parseMarkdown } from './markdown';

function mapped(source: string) {
  const processor = unified().use(parse).use(gfm).use(remarkFirstLineIndent);
  const tree = processor.runSync(processor.parse(source), source) as Root;
  const mapper = createSourceMapper(source, { lineOffset: 6, columnOffset: 2 });
  const leaves: Array<{ node: Text | InlineCode | Code; map: ReturnType<typeof mapper.leaf> }> = [];
  visit(tree, (node) => { if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') leaves.push({ node, map: mapper.leaf(node) }); });
  return { leaves, mapper };
}

describe('visible text to Markdown source', () => {
  it('uses the clicked AST leaf rather than searching for repeated words globally', () => {
    const source = '重复 **重复**\n\n重复';
    const { leaves, mapper } = mapped(source);
    expect(leaves.map(({ map }) => map.points[0])).toEqual([mapper.point(0), mapper.point(5), mapper.point(11)]);
  });
  it('retains UTF-16 boundaries for emoji, escapes and numeric/named entities', () => {
    const source = '中文 👨‍👩‍👧‍👦 \\* &#x1f600; &amp; é结尾';
    const { leaves, mapper } = mapped(source);
    const map = leaves[0].map;
    expect(map.points).toHaveLength(map.text.length + 1);
    expect(map.points[map.text.indexOf('😀')]).toEqual(mapper.point(source.indexOf('&#')));
    expect(map.points[map.text.indexOf('😀') + 2]).toEqual(mapper.point(source.indexOf('&#') + '&#x1f600;'.length));
    expect(map.points[map.text.indexOf('&')]).toEqual(mapper.point(source.indexOf('&amp;')));
    expect(map.points[map.text.indexOf('结尾')]).toEqual(mapper.point(source.indexOf('结尾')));
  });
  it('removes quote/list prefixes and expands :: without losing columns after the marker', () => {
    const source = '> ::   第一行\r\n> 第二行\\\r\n> ::\t第三行\r\n\r\n- 列表';
    const { leaves, mapper } = mapped(source);
    for (const word of ['第一行', '第二行', '第三行', '列表']) {
      const map = leaves.find(({ map }) => map.text.includes(word))!.map;
      expect(map.points[map.text.indexOf(word)]).toEqual(mapper.point(source.indexOf(word)));
    }
  });
  it.each(['- 列表\n\n  ```ts\n  const value = 2;\n\n    extra();\n  ```', '> ```ts\n> const value = 2;\n> ```', '    const value = 2;\n\n    extra();', '```ts\nconst value = 2;'])('retains code indentation and blank lines: %s', (source) => {
    const { leaves, mapper } = mapped(source);
    const map = leaves.find(({ node }) => node.type === 'code')!.map;
    expect(map.points).toHaveLength(map.text.length + 1);
    expect(map.points[map.text.indexOf('value')]).toEqual(mapper.point(source.indexOf('value')));
    if (source.includes('extra')) expect(map.points[map.text.indexOf('extra')]).toEqual(mapper.point(source.indexOf('extra')));
  });
  it('handles padded/multiline inline code and GFM escaped table pipes literally', () => {
    const source = '`` a\r\nb ``\n\n|列|\n|-|\n|`a\\|b`|\n\n`a\\|b`';
    const { leaves, mapper } = mapped(source);
    const maps = leaves.filter(({ node }) => node.type === 'inlineCode').map(({ map }) => map);
    expect(maps[0].text).toBe('a b');
    expect(maps[0].points[2]).toEqual(mapper.point(source.indexOf('b ``')));
    expect(maps[1].text).toBe('a|b');
    expect(maps[1].points[2]).toEqual(mapper.point(source.indexOf('b`')));
    expect(maps[2].text).toBe('a\\|b');
  });
  it('keeps flow whitespace normalization and fallback text tied to the same source', () => {
    const body = '::  中文  &amp;\n重复\n\n![图](./x.png)\n\n## 后续\n\n正文。';
    const parsed = parseMarkdown(body, { image: './x.png', defaultX: .53, defaultY: 86 }, {}, { lineOffset: 6 });
    const lines = parsed.flow!.source!.paragraphs[0][0];
    const map = normalizeSourceMap(joinSourceMaps(lines.map((line) => ({ text: line.text, points: line.points! })), '\n'));
    expect(map.text).toBe('\u2003\u2003中文 & 重复');
    const mapper = createSourceMapper(body, { lineOffset: 6 });
    expect(map.points[map.text.indexOf('&')]).toEqual(mapper.point(body.indexOf('&amp;')));
    expect(map.points[map.text.indexOf('重复')]).toEqual(mapper.point(body.indexOf('重复')));
    const fragment = sliceSourceMap(map, 0, map.text.length, '重复');
    expect(fragment.points[0]).toEqual(mapper.point(body.indexOf('重复')));
  });
});
