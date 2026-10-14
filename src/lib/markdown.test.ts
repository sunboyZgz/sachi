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
      { id: '细节', text: '细节', depth: 4, number: '01.1.1', nesting: 2, parentId: '子节' },
      { id: '重复-1', text: '重复', depth: 2, number: '02', nesting: 0 },
      { id: '新篇章', text: '新篇章', depth: 1, number: '03', nesting: 0 },
      { id: '跳级小节', text: '跳级小节', depth: 3, number: '03.1', nesting: 1, parentId: '新篇章' },
      { id: '分节', text: '分节', depth: 2, number: '03.2', nesting: 1, parentId: '新篇章' },
      { id: '强调与-代码', text: '强调与 代码', depth: 3, number: '03.2.1', nesting: 2, parentId: '分节' },
    ]);
  });

  it('keeps quoted headings out of the contents and includes deep headings without changing the slug sequence', () => {
    const parsed = parseMarkdown('> ## 重复\n\n#### 重复\n\n## 重复\n\n### 子节');
    expect(parsed.headings.map(({ id, number }) => ({ id, number }))).toEqual([
      { id: '重复-1', number: '01' }, { id: '重复-2', number: '02' }, { id: '子节', number: '02.1' },
    ]);
  });

  it('compresses skipped levels into real parent-child relationships and resets siblings and chapters', () => {
    const body = '# 第一章\n\n#### 漂亮的小节\n\n###### 补充\n\n#### 并列小节\n\n## 回到二级\n\n##### 另一段\n\n# 第二章\n\n#### 再一个小节';
    expect(parseMarkdown(body).headings.map(({ text, depth, nesting, number, parentId }) => ({ text, depth, nesting, number, parentId }))).toEqual([
      { text: '第一章', depth: 1, nesting: 0, number: '01', parentId: undefined },
      { text: '漂亮的小节', depth: 4, nesting: 1, number: '01.1', parentId: '第一章' },
      { text: '补充', depth: 6, nesting: 2, number: '01.1.1', parentId: '漂亮的小节' },
      { text: '并列小节', depth: 4, nesting: 1, number: '01.2', parentId: '第一章' },
      { text: '回到二级', depth: 2, nesting: 1, number: '01.3', parentId: '第一章' },
      { text: '另一段', depth: 5, nesting: 2, number: '01.3.1', parentId: '回到二级' },
      { text: '第二章', depth: 1, nesting: 0, number: '02', parentId: undefined },
      { text: '再一个小节', depth: 4, nesting: 1, number: '02.1', parentId: '第二章' },
    ]);
    expect(parseMarkdown('#### 只有四级\n\n#### 又一个四级').headings.map(({ nesting, number }) => [nesting, number])).toEqual([[0, '01'], [0, '02']]);
    expect(parseMarkdown('## 原来的分节\n\n## 下一节').headings.map(({ nesting, number }) => [nesting, number])).toEqual([[0, '01'], [0, '02']]);
  });

  it('extracts a validated flow intro and preserves the remaining Markdown', () => {
    const result = parseMarkdown(
      '第一段。\n\n第二段。\n\n![一杯茶](./assets/tea-cup.webp)\n\n## 后文\n\n普通正文。',
      { image: '/assets/tea-cup.webp', contour: '/assets/tea-cup-contour.json', defaultX: 0.53, defaultY: 86 },
    );
    expect(result.flow?.paragraphs).toEqual(['第一段。', '第二段。']);
    expect(result.markdown).toBe('第一段。\n\n第二段。\n\n![一杯茶](./assets/tea-cup.webp)\n\n## 后文\n\n普通正文。');
    expect(result.headings).toEqual([{ id: '后文', text: '后文', depth: 2, number: '01', nesting: 0 }]);
  });

  it('treats rich inline paragraphs as boundaries', () => {
    const parsed = parseMarkdown(
      '含有**强调**。\n\n![图](./assets/tea-cup.webp)\n\n## 后文',
      { image: '/assets/tea-cup.webp', contour: '/assets/tea-cup-contour.json', defaultX: 0.53, defaultY: 86 },
    );
    expect(parsed.flows).toEqual([]);
    expect(parsed.warnings.join(' ')).toContain('没有连续纯文本');
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
    expect(parsed.markdown).toBe(body);
    expect(parseMarkdown('::含有 **强调** 与 [链接](https://example.org/)').description).toBe('含有 强调 与 链接');
    expect(parseMarkdown('\\::字面符号。').description).toBe('::字面符号。');
  });

  it('keeps the existing plain-text restriction in marked flow paragraphs', () => {
    expect(parseMarkdown('::有 **强调**。\n\n![图](./assets/shape.png)\n\n## 后文', { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 }).flows).toEqual([]);
  });

  it('distinguishes hard breaks from paragraphs and soft newlines in a flow intro', () => {
    const body = '第一行。\\\n::第二行。  \n第三行。\n\n::另一个段落。\n仅软换行。\n\n![图](./assets/shape.png)\n\n## 后文';
    const parsed = parseMarkdown(body, { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 });
    expect(parsed.flow?.paragraphs).toEqual(['第一行。\n\u2003\u2003第二行。\n第三行。', '\u2003\u2003另一个段落。\n仅软换行。']);
    expect(parsed.flow?.hardLines).toEqual([['第一行。', '\u2003\u2003第二行。', '第三行。'], ['\u2003\u2003另一个段落。\n仅软换行。']]);
    expect(parsed.description).toBe('第一行。第二行。第三行。');
    expect(parsed.markdown).toBe(body);
    expect(parseMarkdown('::第一行。\n\n![图](./assets/shape.png)\n\n## 后文', { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 }).flow?.hardLines).toBeUndefined();
  });

  it('preserves empty hard lines and escaped line-start markers in flow', () => {
    const body = '::第一行。\\\n\\\n\\::字面符号。\n\n![图](./assets/shape.png)\n\n## 后文';
    const parsed = parseMarkdown(body, { image: './assets/shape.png', defaultX: 0.53, defaultY: 86 });
    expect(parsed.flow?.hardLines).toEqual([['\u2003\u2003第一行。', '', '::字面符号。']]);
  });
});

const spec = (image: string, width = 180) => ({ image, width, defaultX: .53, defaultY: 54 });
describe('automatic local flow regions', () => {
  it.each(['![图](./assets/a.png)\n\n正文。', '前文。\n\n![图](./assets/a.png)\n\n后文。', '正文。\n\n![图](./assets/a.png)', '# 开头\n\n#### 小标题\n\n正文。\n\n![图](./assets/a.png)'])('recognizes regions without an h2: %s', (body) => {
    const parsed = parseMarkdown(body, spec('./assets/a.png'));
    expect(parsed.flows).toHaveLength(1);
    expect(parsed.markdown).toBe(body);
  });
  it('uses all ordinary block boundaries and reuses repeated resources', () => {
    const body = '开头。\n\n![图](./assets/a.png)\n\n---\n\n**强调**。\n\n![图](./assets/b.png)\n\n中间。\n\n- 列表\n\n结尾。\n\n![图](./assets/a.png)';
    const parsed = parseMarkdown(body, [spec('./assets/a.png'), spec('./assets/b.png', 240)], {}, { lineOffset: 7 });
    expect(parsed.flows.map((region) => [region.paragraphs, region.spec.width, region.imageIndex])).toEqual([[['开头。'], 180, 1], [['中间。'], 240, 0], [['结尾。'], 180, 1]]);
    expect(parsed.flows[2].source!.image.start.line).toBe(body.split('\n').length + 7);
  });
  it('resolves reference images with definitions anywhere in the document', () => {
    const body = '开头。\n\n![引用图片][ref]\n\n[ref]: ./assets/a.png\n\n后文。\n\n# 重复\n\n# 重复';
    const parsed = parseMarkdown(body, spec('./assets/a.png'), {}, { lineOffset: 6 });
    expect(parsed.flows[0].paragraphs).toEqual(['开头。', '后文。']);
    expect(parsed.flows[0].source!.image.start).toEqual({ line: 9, column: 1 });
    expect(parsed.headings.map((heading) => heading.id)).toEqual(['重复', '重复-1']);
  });
  it('rejects ambiguous runs but keeps other valid regions in editing previews', () => {
    const body = '首段。\n\n![甲](./assets/a.png)\n\n中段。\n\n![乙](./assets/b.png)\n\n---\n\n![丙](./assets/c.png)\n\n末段。';
    const config = ['a', 'b', 'c'].map((name) => spec(`./assets/${name}.png`));
    expect(() => parseMarkdown(body, config)).toThrow('请用任意标题、分隔线');
    const parsed = parseMarkdown(body, config, {}, undefined, { tolerant: true });
    expect(parsed.flows).toHaveLength(1);
    expect(parsed.flows[0].paragraphs).toEqual(['末段。']);
    expect(parsed.markdown).toBe(body);
  });
  it('reports duplicates, missing images and non-independent image locations', () => {
    expect(() => parseMarkdown('正文。\n\n![图](./assets/a.png)', [spec('./assets/a.png'), spec('./assets/a.png')])).toThrow('配置重复');
    expect(() => parseMarkdown('正文。', spec('./assets/a.png'))).toThrow('未出现在正文');
    expect(() => parseMarkdown('正文 ![图](./assets/a.png)', spec('./assets/a.png'))).toThrow('第 1 行');
    const body = '> ![引用](./assets/a.png)\n\n正文。\n\n![独立](./assets/b.png)';
    const parsed = parseMarkdown(body, [spec('./assets/a.png'), spec('./assets/b.png')], {}, undefined, { tolerant: true });
    expect(parsed.flows).toHaveLength(1);
    expect(parsed.markdown).toBe(body);
  });
  it.each([
    '::前文。\n![图](./assets/a.png)\n::后文。',
    '::前文。\n\n![图](./assets/a.png)\n::后文。',
    '::前文。\n![图](./assets/a.png)\n\n::后文。',
  ])('explains missing paragraph separators and preserves ordinary fallback: %s', (body) => {
    expect(() => parseMarkdown(body, spec('./assets/a.png'))).toThrow('前后各空一行');
    const fallback = parseMarkdown(body, spec('./assets/a.png'), {}, undefined, { tolerant: true });
    expect(fallback.flows).toEqual([]); expect(fallback.markdown).toBe(body);
    expect(fallback.warnings.join(' ')).not.toContain('未出现在正文');
    const separated = body.replace('![图](./assets/a.png)', '\n![图](./assets/a.png)\n');
    const corrected = parseMarkdown(separated, spec('./assets/a.png'));
    expect(corrected.flows).toHaveLength(1); expect(corrected.warnings).toEqual([]);
    expect(corrected.flows[0].paragraphs).toEqual(['\u2003\u2003前文。', '\u2003\u2003后文。']);
    expect(corrected.markdown).toBe(separated);
  });
  it('does not merge settings when two source resources share a frozen display URL', () => {
    const assets = Object.fromEntries(['a', 'b'].map((name) => [`./assets/${name}.png`, { url: '/media/same.png', type: 'image' as const, width: 100, height: 200 }]));
    const parsed = parseMarkdown('正文。\n\n![甲](./assets/a.png)\n\n---\n\n正文。\n\n![乙](./assets/b.png)', [spec('./assets/a.png', 120), spec('./assets/b.png', 360)], assets);
    expect(parsed.flows.map((region) => region.spec.width)).toEqual([120, 360]);
  });
});


it.each(['# 标题', '#### 小标题', '---', '- 列表项', '> 引用', '| 表头 |\n| --- |\n| 单元格 |', '```ts\nconst x = 1;\n```', '**富文本**', '![普通图片](./assets/other.png)'])('stops auto flow at ordinary block %s', (boundary) => {
  const body = `不参与的前文。\n\n${boundary}\n\n参与的后文。\n\n![图](./assets/a.png)`;
  const parsed = parseMarkdown(body, spec('./assets/a.png'));
  expect(parsed.flows[0].paragraphs).toEqual(['参与的后文。']);
  expect(parsed.markdown).toBe(body);
});


it('uses the configured frozen image and its contour for legacy path aliases', () => {
  const parsed = parseMarkdown('正文。\n\n![图](./assets/a.jpg)', spec('/assets/a.jpg'), {
    '/assets/a.jpg': { url: '/media/flow.png', contour: '/media/flow.json', type: 'image', width: 400, height: 800 },
    './assets/a.jpg': { url: '/media/photo.webp', type: 'image', width: 400, height: 800 },
  });
  expect(parsed.flows[0].spec).toMatchObject({ image: '/media/flow.png', contour: '/media/flow.json' });
});
