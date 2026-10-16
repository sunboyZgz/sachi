import { describe, expect, it } from 'vitest';
import { addDays, calendarStats, dateParts, indexCalendarPosts, latestDate, monthGrid, publicationDays, weekday, yearGrid } from './writing-calendar';

const entry = (id: string, publishedAt: string) => ({ id, slug: id, title: id, category: 'learn' as const, publishedAt });

describe('writing calendar dates and public publication counts', () => {
  it('counts first publication in the site timezone, deduplicates identities and excludes fixtures and future records', () => {
    const posts = publicationDays([
      entry('one', '2026-10-14T16:30:00Z'),
      entry('two', '2026-10-15T10:00:00+08:00'),
      entry('one', '2026-10-10T00:00:00Z'),
      { ...entry('fixture', '2026-10-15T00:00:00Z'), fixture: true },
      entry('future', '2026-10-15T16:01:00Z'),
      entry('bad-date', 'invalid'),
      entry('last-year', '2025-03-10T00:00:00Z'),
    ], 'Asia/Shanghai', '2026-10-15');
    expect(posts.map((post) => [post.id, post.date])).toEqual([['one', '2026-10-15'], ['two', '2026-10-15'], ['last-year', '2025-03-10']]);
    expect(calendarStats(posts, 2026)).toEqual({ posts: 2, days: 1 });
    expect(calendarStats(posts, 2024)).toEqual({ posts: 0, days: 0 });
    expect(indexCalendarPosts(posts).get('2026-10-15')).toHaveLength(2);
    expect(latestDate(posts, 2026, 10)).toBe('2026-10-15');
    expect(latestDate(posts, 2026, 9)).toBeNull();
  });

  it('handles leap days, year boundaries and the uncommon 54-column year without truncating days', () => {
    for (const [year, length] of [[2026, 365], [2024, 366], [2000, 366], [2100, 365], [2012, 366]]) {
      const grid = yearGrid(year);
      const dates = grid.cells.filter(Boolean);
      expect(dates).toHaveLength(length);
      expect(new Set(dates).size).toBe(length);
      expect(dates[0]).toBe(`${year}-01-01`);
      expect(dates.at(-1)).toBe(`${year}-12-31`);
      expect(grid.cells.indexOf(`${year}-01-01`)).toBe(weekday(`${year}-01-01`));
    }
    expect(yearGrid(2012).weeks).toBe(54);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dateParts('2026-02-29')).toBeNull();
    expect(dateParts('2026-13-01')).toBeNull();
  });

  it('keeps month padding empty and preserves the exact month length', () => {
    const february = monthGrid(2026, 2);
    expect(february.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(february.filter(Boolean)).toHaveLength(28);
    expect(monthGrid(2024, 2).filter(Boolean)).toHaveLength(29);
  });
});
