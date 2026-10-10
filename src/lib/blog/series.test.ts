import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { seriesIndex, validateSeriesMembers } from './series';
import { postSchema, seriesRefSchema, type Series } from './schema';
import { sha256, stableJson } from './files';

const series: Series = { id: randomUUID(), slug: 'notes', title: '学习记录', category: 'learn' };
const chapter = (order: number) => postSchema.parse({ id: randomUUID(), slug: `chapter-${order}`, title: `第 ${order} 篇`, createdAt: '2026-10-01T00:00:00Z', date: '2026-10-01', category: 'learn', body: '正文', minutes: 1, series: { id: series.id, order } });

describe('native series index', () => {
  it('sorts by explicit chapter order, keeps gaps and only uses supplied chapters', () => {
    const posts = [chapter(6), chapter(1), chapter(3)];
    expect(seriesIndex(posts, [series])[0].chapters.map((post) => post.series!.order)).toEqual([1, 3, 6]);
    expect(seriesIndex([], [series])).toEqual([]);
  });
  it('rejects duplicated order, unknown series and cross-category membership', () => {
    expect(() => validateSeriesMembers([chapter(1), chapter(1)], [series])).toThrow('序号重复');
    expect(() => validateSeriesMembers([chapter(1)], [])).toThrow('不存在');
    expect(() => validateSeriesMembers([{ ...chapter(1), category: 'life' }], [series])).toThrow('同一栏目');
  });
  it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid chapter order %s', (order) => {
    expect(seriesRefSchema.safeParse({ id: series.id, order }).success).toBe(false);
  });
  it('does not inject series into a legacy article or change its semantic digest', () => {
    const post = chapter(1);
    delete post.series;
    const digest = sha256(stableJson(post));
    const parsed = postSchema.parse(post);
    expect(Object.hasOwn(parsed, 'series')).toBe(false);
    expect(sha256(stableJson(parsed))).toBe(digest);
  });
});
