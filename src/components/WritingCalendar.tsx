'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { SiteLink } from './SiteLink';
import type { CategoryId } from '@/config/site';
import { addDays, calendarStats, dateKey, dateParts, indexCalendarPosts, latestDate, monthGrid, weekday, yearGrid, zonedDay, type CalendarPost } from '@/lib/writing-calendar';

const monthlyQuery = '(max-width: 1023px), (hover: none) and (pointer: coarse)';
const dotted = (value: string) => value.replaceAll('-', '.');
function subscribeMedia(listener: () => void) {
  const media = window.matchMedia(monthlyQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
function subscribeClock(listener: () => void) {
  const timer = window.setInterval(listener, 60_000);
  document.addEventListener('visibilitychange', listener);
  return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', listener); };
}

export function WritingCalendar({ posts, today: initialToday, timeZone, fixture, categoryNames, children }: {
  posts: CalendarPost[]; today: string; timeZone: string; fixture: boolean; categoryNames: Record<CategoryId, string>; children: ReactNode;
}) {
  const monthly = useSyncExternalStore(subscribeMedia, () => window.matchMedia(monthlyQuery).matches, () => false);
  const getToday = useCallback(() => zonedDay(new Date().toISOString(), timeZone), [timeZone]);
  const today = useSyncExternalStore(subscribeClock, getToday, () => initialToday);
  const now = dateParts(today)!;
  const [chosenYear, setChosenYear] = useState<number | null>(null);
  const [chosenMonth, setChosenMonth] = useState<number | null>(null);
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [jumpDate, setJumpDate] = useState<string | null>(null);
  const [dateError, setDateError] = useState('');
  const [tooltip, setTooltip] = useState<{ text: string; left: number; top: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const year = chosenYear ?? now.year;
  const years = useMemo(() => [...new Set([now.year, ...posts.map((post) => dateParts(post.date)!.year).filter((value) => value <= now.year)])].toSorted((a, b) => b - a), [posts, now.year]);
  const byDate = useMemo(() => indexCalendarPosts(posts), [posts]);
  const capMonth = year === now.year ? now.month : 12;
  const month = Math.min(chosenMonth ?? (year === now.year ? now.month : dateParts(latestDate(posts, year) ?? dateKey(year, 1, 1))!.month), capMonth);
  const selected = chosenDate && dateParts(chosenDate)!.year === year && (!monthly || dateParts(chosenDate)!.month === month)
    ? chosenDate : latestDate(posts, year, monthly ? month : undefined);
  const statistics = calendarStats(posts, year);
  const annual = useMemo(() => yearGrid(year), [year]);
  const cells = monthly ? monthGrid(year, month) : annual.cells;
  const available = cells.filter((key): key is string => !!key && key <= today);
  const activeFocus = available.includes(focusDate ?? '') ? focusDate : selected ?? available[0];
  const articles = selected ? byDate.get(selected) ?? [] : [];
  const emptyTitle = !posts.length ? '这里还没有公开文章' : !statistics.posts ? '这一年还没有公开文章' : '这个月还没有公开文章';

  useEffect(() => {
    const hide = () => setTooltip(null);
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide, { passive: true });
    return () => { window.removeEventListener('scroll', hide); window.removeEventListener('resize', hide); };
  }, []);

  function resetSelection() { setChosenDate(null); setFocusDate(null); setTooltip(null); setJumpDate(null); setDateError(''); }
  function chooseDate(key: string) {
    const parsed = dateParts(key);
    if (!parsed || key > today || !years.includes(parsed.year)) return false;
    setChosenYear(parsed.year); setChosenMonth(parsed.month); setChosenDate(key); setFocusDate(key); setJumpDate(key); setDateError('');
    return true;
  }
  function dateLabel(key: string) {
    const count = byDate.get(key)?.length ?? 0;
    return `${dotted(key)} · ${count ? `发布 ${count} 篇` : '当天没有公开文章'}`;
  }
  function showTooltip(button: HTMLButtonElement) {
    if (monthly || button.disabled) return;
    const box = button.getBoundingClientRect();
    setTooltip({ text: dateLabel(button.dataset.date!), left: Math.max(12, Math.min(window.innerWidth - 244, box.left - 80)), top: box.top < 48 ? box.bottom + 8 : box.top - 42 });
  }
  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLButtonElement;
    const key = target.dataset.date;
    if (!key) return;
    const offsets: Record<string, number> = monthly ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } : { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    let next: string | null = null;
    if (event.key in offsets) next = addDays(key, offsets[event.key]);
    else if (event.key === 'Home') next = event.ctrlKey ? available[0] : addDays(key, -weekday(key));
    else if (event.key === 'End') next = event.ctrlKey ? available.at(-1)! : addDays(key, 6 - weekday(key));
    else if (event.key === 'Escape') { setTooltip(null); return; }
    else return;
    event.preventDefault();
    if (next && available.includes(next)) {
      setFocusDate(next);
      gridRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${next}"]`)?.focus();
    }
  }

  return <section className="calendar-section" id="writing-calendar" aria-labelledby="calendar-title">
    <div className="calendar-heading">
      <div><h2 className="section-title" id="calendar-title">写作日历</h2><p className="section-subtitle">用文字，记录生活的光。</p></div>
      <p className="annual-summary"><span className="summary-year">{year} 年 · </span>本年发布 <strong>{statistics.posts}</strong> 篇 · 发文 <strong>{statistics.days}</strong> 天</p>
      <div className="calendar-meta">
        {/* <div className="year-control">{years.length === 1 ? <span>{year}年</span> : <select aria-label="选择年份" value={year} onChange={(event) => { setChosenYear(Number(event.target.value)); setChosenMonth(null); resetSelection(); }}>
          {years.map((value) => <option key={value} value={value}>{value}年</option>)}
        </select>}</div> */}
      </div>
    </div>
    {fixture ? <p className="calendar-fixture-note">排版示例 · 非公开发文记录</p> : null}
    <div className="js-calendar calendar-ui" data-view={monthly ? 'month' : 'year'}>
      <div className="calendar-chart">
        {monthly ? <div className="month-view">
          <div className="month-controls">
            <button type="button" disabled={month <= 1} onClick={() => { setChosenMonth(month - 1); resetSelection(); }}>← 上个月</button>
            <h3 className="month-title" aria-live="polite">{year}年{month}月</h3>
            <button type="button" disabled={month >= capMonth} onClick={() => { setChosenMonth(month + 1); resetSelection(); }}>下个月 →</button>
          </div>
          <div className="month-weekdays" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
          {renderGrid()}
        </div> : <div className="year-calendar">
          <div className="weekday-labels" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>周{day}</span>)}</div>
          <div className="year-board">
            <div className="month-labels" aria-hidden="true" style={{ '--weeks': annual.weeks } as CSSProperties}>
              {Array.from({ length: 12 }, (_, index) => <span key={index} style={{ gridColumn: Math.floor(annual.cells.indexOf(dateKey(year, index + 1, 1)) / 7) + 1, gridRow: 1 }}>{index + 1}月</span>)}
            </div>
            {renderGrid()}
          </div>
        </div>}
      </div>
      <div className="calendar-bottom">
        <details className="date-jump"><summary>按日期查看</summary><form onSubmit={(event) => {
          event.preventDefault();
          if (!chooseDate(jumpDate ?? selected ?? today)) setDateError('请选择可选年份中、不晚于今天的日期。');
        }}>
          <label htmlFor="calendar-jump-date">选择日期</label>
          <input id="calendar-jump-date" type="date" required min={dateKey(years.at(-1)!, 1, 1)} max={today} value={jumpDate ?? selected ?? today} onChange={(event) => setJumpDate(event.target.value)} />
          <button type="submit">查看</button>
          {dateError ? <p className="date-error" role="status">{dateError}</p> : null}
        </form></details>
      </div>
      <div className="selected-entries" aria-label="选中日期的文章">
        <h3 className="selected-date" aria-live="polite" aria-atomic="true">{selected ? <><time dateTime={selected}>{dotted(selected)}</time> · {articles.length ? `发布 ${articles.length} 篇` : '当天没有公开文章'}</> : emptyTitle}</h3>
        {articles.length ? <ul className="entry-list">{articles.map((post) => <li key={post.id}><SiteLink className="entry-link" href={`/article/${post.slug}/`}><span className="entry-title">{post.title}</span><span className="entry-category">{categoryNames[post.category]}<span className="entry-arrow" aria-hidden="true">→</span></span></SiteLink></li>)}</ul> : null}
      </div>
    </div>
    {children}
    <noscript><style>{'.about-page .calendar-ui{display:none!important}.about-page .fallback-calendar{display:block!important}'}</style></noscript>
    {tooltip ? <div className="tooltip" role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>{tooltip.text}</div> : null}
  </section>;

  function renderGrid() {
    return <div ref={gridRef} className={monthly ? 'month-grid' : 'day-grid'} role="group" aria-label={`${year}年${monthly ? `${month}月` : ''}写作日历`} onKeyDown={moveFocus} onPointerLeave={() => setTooltip(null)}>
      {cells.map((key, index) => key ? <button key={key} type="button" className={`day-cell${key > today ? ' is-future' : ''}`} data-date={key} data-count={Math.min(4, byDate.get(key)?.length ?? 0)}
        disabled={key > today} aria-label={key > today ? `${dotted(key)} · 未来日期，不可选择` : dateLabel(key)} aria-pressed={key > today ? undefined : key === selected}
        tabIndex={key === activeFocus && key <= today ? 0 : -1}
        onClick={() => chooseDate(key)} onPointerEnter={(event) => { if (event.pointerType !== 'touch') showTooltip(event.currentTarget); }}
        onFocus={(event) => { setFocusDate(key); showTooltip(event.currentTarget); }} onBlur={() => setTooltip(null)}>
        {monthly ? dateParts(key)!.day : null}
      </button> : <span className="day-cell is-pad" aria-hidden="true" key={`pad-${index}`} />)}
    </div>;
  }
}
