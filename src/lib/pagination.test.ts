import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pagination } from '../components/Pagination';
import { consumePaginationHandoff, createPaginationWindowStore, paginationHandoffKey, paginationHref, paginationWindow, writePaginationHandoff, type PaginationContext } from './pagination';

const context: PaginationContext = { category: 'play', current: 2, total: 6, basePath: '', scope: 'working' };
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
afterEach(() => vi.unstubAllEnvs());

describe('two-page pagination window', () => {
  it('hides single pages and renders only two neighbouring numbers even above 99', () => {
    for (const total of [0, 1]) expect(paginationWindow(1, total)).toEqual([]);
    for (const total of [2, 3, 6, 150]) {
      for (let current = 1; current <= total; current += 1) {
        const pages = paginationWindow(current, total);
        expect(pages).toHaveLength(2);
        expect(pages).toContain(current);
        expect(pages[1]).toBe(pages[0] + 1);
        expect(pages[0]).toBeGreaterThanOrEqual(1);
        expect(pages[1]).toBeLessThanOrEqual(total);
      }
    }
  });
  it('keeps the window until a boundary is crossed, in either direction', () => {
    let start = 1;
    const expected = [[1, 2], [1, 2], [2, 3], [3, 4], [3, 4], [2, 3], [1, 2]];
    [1, 2, 3, 4, 3, 2, 1].forEach((current, index) => {
      const window = paginationWindow(current, 6, start);
      expect(window).toEqual(expected[index]); start = window[0];
    });
    expect(paginationWindow(6, 6, 100)).toEqual([5, 6]);
  });
  it('keeps real static URLs and prefixes a Pages subpath exactly once', () => {
    expect(paginationHref('play', 1)).toBe('/category/play/');
    expect(paginationHref('play', 3, '/sachi')).toBe('/sachi/category/play/page/3/');
    vi.stubEnv('NEXT_PUBLIC_BLOG_BASE_PATH', '/sachi');
    const html = renderToStaticMarkup(createElement(Pagination, { category: 'play', current: 100, total: 150 }));
    expect(html.match(/aria-label="第 \d+ 页"/g)).toHaveLength(2);
    expect(html).toContain('>99</a>'); expect(html).toContain('>100</a>');
    expect(html).toContain('href="/sachi/category/play/page/100/" aria-current="page"');
    expect(html).toContain('class="pagination-indicator"');
    expect(html).not.toContain('/sachi/sachi/');
  });
  it('preserves disabled edge arrows and complete no-JS server markup', () => {
    expect(renderToStaticMarkup(createElement(Pagination, { category: 'play', current: 1, total: 1 }))).toBe('');
    const first = renderToStaticMarkup(createElement(Pagination, { category: 'play', current: 1, total: 3 }));
    const last = renderToStaticMarkup(createElement(Pagination, { category: 'play', current: 3, total: 3 }));
    expect(first).toContain('aria-disabled="true" aria-label="上一页"');
    expect(last).toContain('aria-disabled="true" aria-label="下一页"');
    expect(first).toContain('aria-current="page"');
    expect(first.match(/aria-label="第 \d+ 页"/g)).toHaveLength(2);
  });
});

describe('one-shot, scoped cross-document handoff', () => {
  it('restores a retained neighbour pair and consumes it only once', () => {
    const storage = memoryStorage();
    writePaginationHandoff(storage, context, 2, 2, 1000);
    expect(consumePaginationHandoff(storage, context, '/category/play/page/2/', 1100)).toBe(2);
    expect(storage.getItem(paginationHandoffKey)).toBeNull();
    expect(consumePaginationHandoff(storage, context, '/category/play/page/2/', 1100)).toBeNull();
  });
  it('rejects a different path, category, release, page count, current page or expired record', () => {
    const cases = [
      { ...context, basePath: '/other' }, { ...context, category: 'life' as const },
      { ...context, scope: 'another-release' }, { ...context, total: 7 }, { ...context, current: 3 },
    ];
    for (const candidate of cases) {
      const storage = memoryStorage(); writePaginationHandoff(storage, context, 2, 2, 1000);
      expect(consumePaginationHandoff(storage, candidate, '/category/play/page/2/', 1100)).toBeNull();
      expect(storage.getItem(paginationHandoffKey)).toBeNull();
    }
    const storage = memoryStorage(); writePaginationHandoff(storage, context, 2, 2, 1000);
    expect(consumePaginationHandoff(storage, context, '/category/play/page/2/', 16000)).toBeNull();
  });
  it('rejects malformed, out-of-range and future-dated handoffs', () => {
    for (const start of [0, -1, 1.5, 5, 6]) {
      const storage = memoryStorage(); writePaginationHandoff(storage, context, 2, start, 1000);
      expect(consumePaginationHandoff(storage, context, '/category/play/page/2/', 1100)).toBeNull();
    }
    const storage = memoryStorage(); storage.setItem(paginationHandoffKey, '{');
    expect(consumePaginationHandoff(storage, context, '/category/play/page/2/', 1100)).toBeNull();
    writePaginationHandoff(storage, context, 2, 2, 5000);
    expect(consumePaginationHandoff(storage, context, '/category/play/page/2/', 1000)).toBeNull();
  });
  it('does not touch browser storage during server rendering', () => {
    const store = createPaginationWindowStore(context);
    expect(store.getServerSnapshot()).toBe(1);
    expect(store.getSnapshot()).toBe(1);
  });
});
