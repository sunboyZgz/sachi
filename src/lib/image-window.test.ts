import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { imageWindowSchema, imageWindowsSchema, imageWindowStyle, normalizeImageWindow, windowForImage } from './image-window';
import { windowContour, availableIntervals } from './flow-geometry';
import { ArticleProse } from '../components/ArticleProse';
import { parseMarkdown } from './markdown';
import { postSchema } from './blog/schema';

const window = { x: .25, y: .25, width: .5, height: .5 };
describe('non-destructive image viewports', () => {
  it('validates bounds, local image ownership, duplicate references and preserves absent old metadata', () => {
    for (const value of [{ ...window, x: -1 }, { ...window, width: 0 }, { ...window, y: .9 }, { ...window, height: Infinity }, { ...window, order: 1 }]) expect(imageWindowSchema.safeParse(value).success).toBe(false);
    for (const ref of ['http://example.org/a.png', './assets/../a.png', './assets/a.mp4', './assets/a.png?v=1']) expect(imageWindowsSchema.safeParse({ [ref]: window }).success).toBe(false);
    expect(imageWindowsSchema.safeParse({ './assets/a.png': window, '/assets/a.png': window }).success).toBe(false);
    expect(windowForImage({ './assets/a%20b.png': window }, '/assets/a b.png')).toEqual(window);
    expect(normalizeImageWindow({ x: .9, y: -.2, width: .5, height: .3 })).toEqual({ x: .5, y: 0, width: .5, height: .3 });
    const post = postSchema.parse({ id: 'legacy-000000000000000000000000', slug: 'old', title: '旧稿', category: 'life', date: '2026-10-14', createdAt: '2026-10-14T09:00:00Z', body: '正文', minutes: 1 });
    expect(Object.hasOwn(post, 'imageWindows')).toBe(false);
  });
  it('uses the complete original image and a proportionate viewport in static, no-JS and preview markup', () => {
    const body = '前行\n![图][a]\n后行\n尾行\n\n[a]: ./assets/a.png';
    const assets = { './assets/a.png': { type: 'image' as const, url: '/media/frozen-original.png', width: 400, height: 200 } };
    const parsed = parseMarkdown(body, undefined, assets, { lineOffset: 9 }, { type: 'poem', imageWindows: { './assets/a.png': window } });
    const html = renderToStaticMarkup(createElement(ArticleProse, { parsed, assets, flowKey: 'window' }));
    expect(html).toContain('src="/media/frozen-original.png"');
    expect(html).toContain('width:min(100%, 200px);aspect-ratio:200 / 100');
    expect(html).toContain('left:-50%;top:-50%');
    expect(html).toContain('data-source-start="11"');
    expect(html.match(/poem-stanza/g)).toHaveLength(2);
    expect(html).not.toContain('裁剪可视窗口');
    expect(imageWindowStyle(window)).toMatchObject({ width: '200%', height: '200%', left: '-50%', top: '-50%' });
    const resizedAssets = { './assets/a.png': { ...assets['./assets/a.png'], width: 200, height: 100, originalWidth: 400, originalHeight: 200 } };
    expect(renderToStaticMarkup(createElement(ArticleProse, { parsed, assets: resizedAssets, flowKey: 'window' }))).toContain('width:min(100%, 200px);aspect-ratio:200 / 100');
  });
  it('clips and reprojects the original alpha contour to the same viewport used by flow images', () => {
    const original = { height: 4, rows: [null, [.2, .8], [.4, .6], null] } as const;
    const contour = { height: original.height, rows: original.rows.map((row) => row ? [...row] as [number, number] : null) };
    const clipped = windowContour(contour, window);
    expect(clipped.height).toBe(2);
    expect(clipped.rows[0]).toEqual([0, 1]);
    expect(clipped.rows[1]![0]).toBeCloseTo(.3); expect(clipped.rows[1]![1]).toBeCloseTo(.7);
    expect(contour.rows[1]).toEqual([.2, .8]);
    expect(availableIntervals(720, 0, 36, { x: 200, y: 0, width: 180, height: 100 }, clipped)).toHaveLength(2);
    expect(windowContour(contour)).toBe(contour);
    const parsed = parseMarkdown('文字。\n\n![图](./assets/a.png)', { image: './assets/a.png', width: 180, defaultX: .53, defaultY: 86 }, {}, undefined, { imageWindows: { './assets/a.png': window } });
    expect(parsed.flows[0].spec.imageWindow).toEqual(window); expect(parsed.flows[0].spec.imageReference).toBe('./assets/a.png');
  });
});
