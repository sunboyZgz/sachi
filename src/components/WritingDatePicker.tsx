'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { addDays, adjacentCalendarMonth, dateKey, dateParts, monthGrid, weekday } from '@/lib/writing-calendar';

type View = 'days' | 'months' | 'years';
type Cursor = { year: number; month: number };

export function WritingDatePicker({ value, today, years, onSelect }: {
  value: string | null; today: string; years: number[]; onSelect: (date: string) => boolean;
}) {
  const initial = dateParts(value ?? today)!;
  const now = dateParts(today)!;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('days');
  const [cursor, setCursor] = useState<Cursor>({ year: initial.year, month: initial.month });
  const [focusToken, setFocusToken] = useState(value ?? today);
  const orderedYears = useMemo(() => [...years].toSorted((a, b) => a - b), [years]);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);
  const days = monthGrid(cursor.year, cursor.month);
  const previous = adjacentCalendarMonth(cursor.year, cursor.month, -1, years, today);
  const next = adjacentCalendarMonth(cursor.year, cursor.month, 1, years, today);
  const yearIndex = orderedYears.indexOf(cursor.year);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current!;
    const panel = panelRef.current!;
    function position() {
      const viewport = window.visualViewport;
      const edge = 12;
      const gap = 8;
      const leftEdge = (viewport?.offsetLeft ?? 0) + edge;
      const topEdge = (viewport?.offsetTop ?? 0) + edge;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - edge * 2;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - edge * 2;
      const anchor = trigger.getBoundingClientRect();
      panel.style.width = `${Math.min(328, rightEdge - leftEdge)}px`;
      panel.style.maxHeight = `${bottomEdge - topEdge}px`;
      const height = panel.getBoundingClientRect().height;
      const below = Math.max(0, bottomEdge - anchor.bottom - gap);
      const above = Math.max(0, anchor.top - gap - topEdge);
      const upwards = height > below && above > below;
      panel.style.maxHeight = `${Math.min(bottomEdge - topEdge, Math.max(above, below))}px`;
      const bounds = panel.getBoundingClientRect();
      const top = upwards ? anchor.top - gap - bounds.height : anchor.bottom + gap;
      panel.style.left = `${Math.max(leftEdge, Math.min(anchor.left, rightEdge - bounds.width))}px`;
      panel.style.top = `${Math.max(topEdge, Math.min(top, bottomEdge - bounds.height))}px`;
      panel.style.visibility = 'visible';
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: Event) {
      const target = event.target;
      if (target instanceof Node && !triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [open]);

  useEffect(() => {
    if (open && focusPending.current) {
      panelRef.current?.querySelector<HTMLButtonElement>('button[data-picker-focus="true"]')?.focus({ preventScroll: true });
      focusPending.current = false;
    }
  }, [open, view, cursor, focusToken]);

  function close() { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); }
  function toggle() {
    if (open) { setOpen(false); return; }
    const selected = dateParts(value ?? today)!;
    setCursor({ year: selected.year, month: selected.month });
    setView('days'); setFocusToken(value ?? today); focusPending.current = true; setOpen(true);
  }
  function focusInMonth(target: Cursor, day = 1) {
    const lastDay = new Date(Date.UTC(target.year, target.month, 0)).getUTCDate();
    return dateKey(target.year, target.month, Math.min(day, lastDay, target.year === now.year && target.month === now.month ? now.day : 31));
  }
  function changeView(target: View) {
    setView(target);
    setFocusToken(target === 'years' ? String(cursor.year) : target === 'months' ? String(cursor.month) : focusInMonth(cursor, dateParts(value ?? today)!.day));
    focusPending.current = true;
  }
  function changeMonth(target: Cursor, focus = false, day = 1) {
    setCursor(target); setFocusToken(focusInMonth(target, day)); focusPending.current = focus;
  }
  function changeYear(target: number) {
    const month = target === now.year ? Math.min(cursor.month, now.month) : cursor.month;
    setCursor({ year: target, month });
    setFocusToken(view === 'months' ? String(month) : focusInMonth({ year: target, month }));
  }
  function selectDate(key: string) { if (key <= today && years.includes(dateParts(key)!.year) && onSelect(key)) close(); }
  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const button = event.target as HTMLButtonElement;
    if (!button.dataset.pickerValue) return;
    const token = button.dataset.pickerValue;
    if (view !== 'days') {
      const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
      const index = options.indexOf(button);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key in offsets ? index + offsets[event.key] : null;
      if (target === null) return;
      event.preventDefault();
      if (options[target]) { setFocusToken(options[target].dataset.pickerValue!); focusPending.current = true; }
      return;
    }
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let key: string | null = null;
    if (event.key in offsets) key = addDays(token, offsets[event.key]);
    else if (event.key === 'Home') key = addDays(token, -weekday(token));
    else if (event.key === 'End') key = addDays(token, 6 - weekday(token));
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const target = event.key === 'PageUp' ? previous : next;
      if (target) key = focusInMonth(target, dateParts(token)!.day);
    } else return;
    event.preventDefault();
    const parsed = key ? dateParts(key) : null;
    if (key && parsed && key <= today && years.includes(parsed.year)) {
      setCursor({ year: parsed.year, month: parsed.month }); setFocusToken(key); focusPending.current = true;
    }
  }

  return <div className="date-picker" onKeyDown={(event) => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <button className="date-picker-trigger" type="button" ref={triggerRef} onClick={toggle} aria-expanded={open} aria-haspopup="dialog" aria-controls={panelId}>
      <span>按日期查看</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open ? createPortal(<div className="date-picker-panel" id={panelId} ref={panelRef} role="dialog" aria-label="选择日期">
      <div className="date-picker-heading">
        {view === 'years' ? <span className="date-picker-nav-space" /> : <button className="date-picker-nav" type="button" aria-label={view === 'days' ? '选择器上个月' : '选择器上一年'}
          disabled={view === 'days' ? !previous : yearIndex <= 0} onClick={() => view === 'days' ? previous && changeMonth(previous) : changeYear(orderedYears[yearIndex - 1])}>←</button>}
        <div className="date-picker-heading-controls">
          <button className="date-picker-period" type="button" aria-label={`选择年份，当前${cursor.year}年`} aria-pressed={view === 'years'} onClick={() => changeView(view === 'years' ? 'days' : 'years')}>{cursor.year}<span>年</span></button>
          <button className="date-picker-period" type="button" aria-label={`选择月份，当前${cursor.month}月`} aria-pressed={view === 'months'} onClick={() => changeView(view === 'months' ? 'days' : 'months')}>{String(cursor.month).padStart(2, '0')}<span>月</span></button>
        </div>
        {view === 'years' ? <span className="date-picker-nav-space" /> : <button className="date-picker-nav" type="button" aria-label={view === 'days' ? '选择器下个月' : '选择器下一年'}
          disabled={view === 'days' ? !next : yearIndex >= orderedYears.length - 1} onClick={() => view === 'days' ? next && changeMonth(next) : changeYear(orderedYears[yearIndex + 1])}>→</button>}
      </div>
      {view === 'days' ? <>
        <div className="date-picker-weekdays" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map((label) => <span key={label}>{label}</span>)}</div>
        <div className="date-picker-days" role="group" aria-label={`${cursor.year}年${cursor.month}月日期`} onKeyDown={onGridKeyDown}>
          {days.map((key, index) => key ? <button key={key} className="date-picker-day" type="button" disabled={key > today}
            aria-label={key.replaceAll('-', '.')} aria-pressed={key === value} aria-current={key === today ? 'date' : undefined}
            data-picker-value={key} data-picker-focus={focusToken === key} tabIndex={focusToken === key && key <= today ? 0 : -1}
            onFocus={() => setFocusToken(key)} onClick={() => selectDate(key)}>{dateParts(key)!.day}</button> : <span key={`pad-${index}`} />)}
        </div>
      </> : <div className="date-picker-options" role="group" aria-label={view === 'years' ? '选择年份' : '选择月份'} onKeyDown={onGridKeyDown}>
        {(view === 'years' ? orderedYears : Array.from({ length: 12 }, (_, index) => index + 1)).map((option) => <button key={option} type="button"
          disabled={view === 'months' && dateKey(cursor.year, option, 1) > today} aria-pressed={option === (view === 'years' ? cursor.year : cursor.month)}
          data-picker-value={option} data-picker-focus={focusToken === String(option)} tabIndex={focusToken === String(option) ? 0 : -1}
          onFocus={() => setFocusToken(String(option))} onClick={() => {
            if (view === 'years') { const month = option === now.year ? Math.min(cursor.month, now.month) : cursor.month; setCursor({ year: option, month }); setFocusToken(focusInMonth({ year: option, month })); }
            else { setCursor({ ...cursor, month: option }); setFocusToken(focusInMonth({ ...cursor, month: option })); }
            setView('days'); focusPending.current = true;
          }}>{option}{view === 'years' ? '年' : '月'}</button>)}
      </div>}
      <div className="date-picker-footer"><button type="button" onClick={() => selectDate(today)}>今天</button><button type="button" onClick={close}>收起</button></div>
    </div>, document.body) : null}
  </div>;
}
