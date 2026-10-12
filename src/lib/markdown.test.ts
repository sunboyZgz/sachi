import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('Markdown block parsing', () => {
  it('builds a hierarchy from real parents, including skipped levels and duplicate headings', () => {
    const body = '## 重复\n\n### 子节\n\n#### 细节\n\n## 重复\n\n# 新篇章\n\n### 跳级小节\n\n## 分节\n\n### **强调**与 `代码`';
    const parsed = parseMarkdown(body);
    expect(parsed.markdown).toBe(body);
    expect(parsed.headings).toEqual([
      { id: '重复', text: '重复', depth: 2, number: '01', nesting: 0 },
      { id: '子节', text: '子节', depth: 3, number: '01.1', nesting: 1, parentId: '重复' },
      { id: '重复-1', text: '重复', depth: 2, number: '02', nesting: 0 },
      { id: '新篇章', text: '新篇章', depth: 1, number: '03', nesting: 0 },
      { id: '跳级小节', text: '跳级小节', depth: 3, number: '03.1', nesting: 1, parentId: '新篇章' },
      { id: '分节', text: '分节', depth: 2, number: '03.2', nesting: 1, parentId: '新篇章' },
      { id: '强调与-代码', text: '强调与 代码', depth: 3, number: '03.2.1', nesting: 2, parentId: '分节' },
    ]);
  });

  it('keeps quoted and deep headings out of the contents without changing the slug sequence', () => {
    const parsed = parseMarkdown('> ## 重复\n\n#### 重复\n\n## 重复\n\n### 子节');
    expect(parsed.headings.map(({ id, number }) => ({ id, number }))).toEqual([
      { id: '重复-2', number: '01' }, { id: '子节', number: '01.1' },
    ]);
  });

  it('extracts a validated flow intro and preserves the remaining Markdown', () => {
    const result = parseMarkdown(
      '第一段。\n\n第二段。\n\n![一杯茶](./assets/tea-cup.webp)\n\n## 后文\n\n普通正文。',
      { image: '/assets/tea-cup.webp', contour: '/assets/tea-cup-contour.json', defaultX: 0.53, defaultY: 86 },
    );
    expect(result.flow?.paragraphs).toEqual(['第一段。', '第二段。']);
    expect(result.markdown).toBe('## 后文\n\n普通正文。');
    expect(result.headings).toEqual([{ id: '后文', text: '后文', depth: 2, number: '01', nesting: 0 }]);
  });

  it('rejects rich inline markup inside a Pretext region', () => {
    expect(() => parseMarkdown(
      '含有**强调**。\n\n![图](./assets/tea-cup.webp)\n\n## 后文',
      { image: '/assets/tea-cup.webp', contour: '/assets/tea-cup-contour.json', defaultX: 0.53, defaultY: 86 },
    )).toThrow('不能包含链接、强调、代码或其他富文本');
  });

  it('uses generic image alt and mapped intrinsic dimensions, with an explicit alt override', () => {
    const body = '文字。\n\n![一枝花](./assets/flower.png)\n\n## 后文';
    const assets = { './assets/flower.png': { type: 'image' as const, url: '/media/flower.png', width: 400, height: 800 } };
    const spec = { image: '/media/flower.png', defaultX: 0.4, defaultY: 20, width: 180 };
    expect(parseMarkdown(body, spec, assets).flow?.spec).toMatchObject({ alt: '一枝花', imageWidth: 400, imageHeight: 800, width: 180 });
    expect(parseMarkdown(body, { ...spec, alt: '植物插画' }, assets).flow?.spec.alt).toBe('植物插画');
  });

  it('expands paragraph markers in flow without changing source, headings or summaries', () => {
    const body = ':: 第一段。\n\n第二段。\n\n![图](./assets/shape.png)\n\n## ::后文\n\n::普通正文。';
    const parsed = parseMarkdown(body, { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 });
    expect(parsed.flow?.paragraphs).toEqual(['\u2003\u2003第一段。', '第二段。']);
    expect(parsed.description).toBe('第一段。');
    expect(parsed.headings[0].text).toBe('::后文');
    expect(parsed.markdown).toBe('## ::后文\n\n::普通正文。');
    expect(parseMarkdown('::含有 **强调** 与 [链接](https://example.org/)').description).toBe('含有 强调 与 链接');
    expect(parseMarkdown('\\::字面符号。').description).toBe('::字面符号。');
  });

  it('keeps the existing plain-text restriction in marked flow paragraphs', () => {
    expect(() => parseMarkdown('::有 **强调**。\n\n![图](./assets/shape.png)\n\n## 后文', { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 })).toThrow('不能包含链接、强调、代码或其他富文本');
  });

  it('distinguishes hard breaks from paragraphs and soft newlines in a flow intro', () => {
    const body = '第一行。\\\n::第二行。  \n第三行。\n\n::另一个段落。\n仅软换行。\n\n![图](./assets/shape.png)\n\n## 后文';
    const parsed = parseMarkdown(body, { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 });
    expect(parsed.flow?.paragraphs).toEqual(['第一行。\n\u2003\u2003第二行。\n第三行。', '\u2003\u2003另一个段落。\n仅软换行。']);
    expect(parsed.flow?.hardLines).toEqual([['第一行。', '\u2003\u2003第二行。', '第三行。'], ['\u2003\u2003另一个段落。\n仅软换行。']]);
    expect(parsed.description).toBe('第一行。第二行。第三行。');
    expect(parsed.markdown).toBe('## 后文');
    expect(parseMarkdown('::第一行。\n\n![图](./assets/shape.png)\n\n## 后文', { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 }).flow?.hardLines).toBeUndefined();
  });

  it('preserves empty hard lines and escaped line-start markers in flow', () => {
    const body = '::第一行。\\\n\\\n\\::字面符号。\n\n![图](./assets/shape.png)\n\n## 后文';
    const parsed = parseMarkdown(body, { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 });
    expect(parsed.flow?.hardLines).toEqual([['\u2003\u2003第一行。', '', '::字面符号。']]);
  });
});
