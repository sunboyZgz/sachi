'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { createPaginationWindowStore, paginationHref, paginationWindow, writePaginationHandoff, type PaginationContext } from '../lib/pagination';

const easing = 'cubic-bezier(.22,.61,.36,1)';

export function PaginationControls({ context }: { context: PaginationContext }) {
  const { category, current, total, basePath } = context;
  const [store] = useState(() => createPaginationWindowStore(context));
  const restoredStart = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [preview, setPreview] = useState<{ start: number; target: number } | null>(null);
  const start = preview?.start ?? restoredStart;
  const pages = paginationWindow(current, total, start);
  // During a window exit the committed page can fall outside the incoming window.
  const displayedPages = preview ? [start, start + 1] : pages;
  const indicatedPage = preview?.target ?? current;
  const index = indicatedPage - start;
  const track = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const motion = useRef<{ busy: boolean; sequence: number; animations: Animation[]; timeout?: number }>({ busy: false, sequence: 0, animations: [] });

  useEffect(() => {
    const cancel = () => {
      const state = motion.current;
      state.sequence += 1;
      state.busy = false;
      state.animations.splice(0).forEach((animation) => animation.cancel());
      if (state.timeout !== undefined) window.clearTimeout(state.timeout);
    };
    const reset = () => { cancel(); setPreview(null); };
    window.addEventListener('pagehide', reset);
    window.addEventListener('pageshow', reset);
    return () => {
      window.removeEventListener('pagehide', reset);
      window.removeEventListener('pageshow', reset);
      cancel();
    };
  }, []);

  async function navigate(event: MouseEvent<HTMLAnchorElement>, target: number) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || event.currentTarget.target && event.currentTarget.target !== '_self') return;
    if (target === current || motion.current.busy) { event.preventDefault(); return; }
    const targetStart = paginationWindow(target, total, restoredStart)[0];
    const href = event.currentTarget.href;
    const numberTrack = track.current;
    const line = indicator.current;
    try {
      writePaginationHandoff(window.sessionStorage, context, target, targetStart);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !numberTrack?.animate || !line?.animate) return;
    } catch { return; } // Do not prevent native navigation when an enhancement is unavailable.

    event.preventDefault();
    const state = motion.current;
    state.busy = true;
    const sequence = ++state.sequence;
    const animate = (node: HTMLElement, frames: Keyframe[], duration: number) => {
      const animation = node.animate(frames, { duration, easing, fill: 'forwards' });
      state.animations.push(animation);
      return animation;
    };
    const wait = async (animations: Animation[]) => {
      try {
        await Promise.race([
          Promise.all(animations.map((animation) => animation.finished)),
          new Promise<void>((resolve) => { state.timeout = window.setTimeout(resolve, 500); }),
        ]);
      } finally {
        if (state.timeout !== undefined) { window.clearTimeout(state.timeout); state.timeout = undefined; }
      }
    };
    try {
      if (targetStart === restoredStart) {
        const from = getComputedStyle(line).transform;
        const slotWidth = numberTrack.children[0].getBoundingClientRect().width;
        const gap = Number.parseFloat(getComputedStyle(numberTrack).columnGap) || 0;
        setPreview({ start: targetStart, target });
        await wait([animate(line, [{ transform: from }, { transform: `translateX(${(target - targetStart) * (slotWidth + gap)}px)` }], 220)]);
      } else {
        const direction = target > current ? -1 : 1;
        // Two-phase motion keeps only two real page links, with no ghost controls.
        const exit = animate(numberTrack, [{ transform: 'translateX(0)' }, { transform: `translateX(${direction * 100}%)` }], 120);
        await wait([exit]);
        if (sequence !== state.sequence) return;
        flushSync(() => setPreview({ start: targetStart, target }));
        const enter = animate(numberTrack, [{ transform: `translateX(${-direction * 100}%)` }, { transform: 'translateX(0)' }], 120);
        exit.cancel();
        await wait([enter]);
      }
    } catch { /* A failed/cancelled animation never strands an otherwise valid link. */ }
    if (sequence === state.sequence) window.location.assign(href);
  }

  return (
    <nav className="pagination" aria-label="栏目内容分页" aria-busy={preview ? true : undefined} data-window-start={start}>
      {current > 1 ? (
        <a className="pagination-slot" href={paginationHref(category, current - 1, basePath)} aria-label="上一页" onClick={(event) => { void navigate(event, current - 1); }}>←</a>
      ) : <span className="pagination-slot unavailable" aria-disabled="true" aria-label="上一页">←</span>}
      <div className="pagination-pages">
        <div className="pagination-viewport">
          <div className="pagination-track" ref={track}>
            {displayedPages.map((page) => (
              <a className="pagination-slot" key={page} href={paginationHref(category, page, basePath)}
                aria-current={page === current ? 'page' : undefined} aria-label={`第 ${page} 页`}
                data-selected={page === indicatedPage ? 'true' : undefined} onClick={(event) => { void navigate(event, page); }}>
                {String(page).padStart(2, '0')}
              </a>
            ))}
          </div>
        </div>
        <span className="pagination-indicator" ref={indicator} aria-hidden="true" style={{ '--pagination-index': index } as CSSProperties} />
      </div>
      {current < total ? (
        <a className="pagination-slot" href={paginationHref(category, current + 1, basePath)} aria-label="下一页" onClick={(event) => { void navigate(event, current + 1); }}>→</a>
      ) : <span className="pagination-slot unavailable" aria-disabled="true" aria-label="下一页">→</span>}
      <span className="sr-only" role="status">{preview ? `正在前往第 ${preview.target} 页` : ''}</span>
    </nav>
  );
}
