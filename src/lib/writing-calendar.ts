import type { CategoryId } from '@/config/site';

export type CalendarPost = { id: string; slug: string; title: string; category: CategoryId; date: string };
type Publication = Omit<CalendarPost, 'date'> & { publishedAt: string; fixture?: boolean };

export function dateParts(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== key) return null;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), date };
}

export function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function zonedDay(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(key: string, amount: number) {
  const parsed = dateParts(key);
  if (!parsed) return null;
  parsed.date.setUTCDate(parsed.day + amount);
  return parsed.date.toISOString().slice(0, 10);
}

export function weekday(key: string) { return (dateParts(key)!.date.getUTCDay() + 6) % 7; }

export function yearGrid(year: number) {
  const first = dateKey(year, 1, 1);
  const length = Math.round((dateParts(dateKey(year, 12, 31))!.date.valueOf() - dateParts(first)!.date.valueOf()) / 86_400_000) + 1;
  const leading = weekday(first);
  const weeks = Math.ceil((leading + length) / 7);
  return { weeks, cells: Array.from({ length: weeks * 7 }, (_, index) => index < leading || index >= leading + length ? null : addDays(first, index - leading)) };
}

export function monthGrid(year: number, month: number) {
  const first = dateKey(year, month, 1);
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = weekday(first);
  return Array.from({ length: Math.ceil((leading + length) / 7) * 7 }, (_, index) => index < leading || index >= leading + length ? null : dateKey(year, month, index - leading + 1));
}

/** Only the explicit public manifest (or a labelled fixture preview) supplies these entries. */
export function publicationDays(entries: Publication[], timeZone: string, asOf: string, allowFixtures = false): CalendarPost[] {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    if ((!allowFixtures && entry.fixture) || seen.has(entry.id) || !Number.isFinite(Date.parse(entry.publishedAt))) return [];
    const date = zonedDay(entry.publishedAt, timeZone);
    if (date > asOf) return [];
    seen.add(entry.id);
    return [{ id: entry.id, slug: entry.slug, title: entry.title, category: entry.category, date }];
  }).toSorted((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function indexCalendarPosts(posts: CalendarPost[]) {
  const days = new Map<string, CalendarPost[]>();
  for (const post of posts) {
    const entries = days.get(post.date) ?? [];
    entries.push(post);
    days.set(post.date, entries);
  }
  return days;
}

export function calendarStats(posts: CalendarPost[], year: number) {
  const entries = posts.filter((post) => post.date.startsWith(`${year}-`));
  return { posts: entries.length, days: new Set(entries.map((post) => post.date)).size };
}

export function latestDate(posts: CalendarPost[], year: number, month?: number) {
  const prefix = month === undefined ? `${year}-` : `${year}-${String(month).padStart(2, '0')}-`;
  let latest: string | null = null;
  for (const post of posts) if (post.date.startsWith(prefix) && (!latest || post.date > latest)) latest = post.date;
  return latest;
}
