import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('Markdown block parsing', () => {
  it('extracts a validated flow intro and preserves the remaining Markdown', () => {
    const result = parseMarkdown(
      '第一段。\n\n第二段。\n\n![一杯茶](./assets/tea-cup.webp)\n\n## 后文\n\n普通正文。',
      { image: '/assets/tea-cup.webp', contour: '/assets/tea-cup-contour.json', defaultX: 0.53, defaultY: 86 },
    );
    expect(result.flow?.paragraphs).toEqual(['第一段。', '第二段。']);
    expect(result.markdown).toBe('## 后文\n\n普通正文。');
    expect(result.headings).toEqual([{ id: '后文', text: '后文' }]);
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
});
