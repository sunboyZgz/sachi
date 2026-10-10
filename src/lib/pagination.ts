import type { CategoryId } from '../config/site';
import { withBasePath } from './site-path';

export const paginationHandoffKey = 'sachi:pagination-handoff:v1';
const handoffLifetime = 15_000;
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PaginationContext = { category: CategoryId; current: number; total: number; basePath: string; scope: string };

export function paginationHref(category: CategoryId, page: number, basePath = '') {
  return withBasePath(page === 1 ? `/category/${category}/` : `/category/${category}/page/${page}/`, basePath);
}

/** Keep a visible neighbour; move the window only when its boundary is crossed. */
export function paginationWindow(current: number, total: number, previousStart = Math.max(1, current - 1)) {
  if (total <= 1) return [];
  const start = Math.max(1, Math.min(total - 1,
    current < previousStart ? current : current > previousStart + 1 ? current - 1 : previousStart));
  return [start, start + 1];
}

export function writePaginationHandoff(storage: StorageAccess, context: PaginationContext, target: number, start: number, now = Date.now()) {
  storage.setItem(paginationHandoffKey, JSON.stringify({
    version: 1, category: context.category, total: context.total, scope: context.scope,
    target: paginationHref(context.category, target, context.basePath), current: target, start, expiresAt: now + handoffLifetime,
  }));
}

/** Consume even invalid records: no later refresh or unrelated route may replay them. */
export function consumePaginationHandoff(storage: StorageAccess, context: PaginationContext, pathname: string, now = Date.now()): number | null {
  const raw = storage.getItem(paginationHandoffKey);
  if (!raw) return null;
  storage.removeItem(paginationHandoffKey);
  try {
    const record = JSON.parse(raw);
    if (!record || record.version !== 1 || record.category !== context.category || record.total !== context.total || record.scope !== context.scope
      || record.current !== context.current || record.target !== pathname || pathname !== paginationHref(context.category, context.current, context.basePath)
      || !Number.isInteger(record.start) || record.start < 1 || record.start >= context.total
      || context.current < record.start || context.current > record.start + 1
      || !Number.isFinite(record.expiresAt) || record.expiresAt <= now || record.expiresAt > now + handoffLifetime) return null;
    return record.start;
  } catch { return null; }
}

/** A numeric external snapshot keeps SSR/hydration identical, without render-time storage I/O. */
export function createPaginationWindowStore(context: PaginationContext) {
  const initial = paginationWindow(context.current, context.total)[0] ?? 1;
  let start = initial;
  let consumed = false;
  return {
    getSnapshot: () => start,
    getServerSnapshot: () => initial,
    subscribe: (notify: () => void) => {
      if (!consumed) {
        consumed = true;
        try {
          // A genuine browser return must keep native history/scroll restoration.
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
          const saved = consumePaginationHandoff(window.sessionStorage, context, window.location.pathname);
          if (navigation?.type !== 'back_forward' && saved !== null) start = saved;
        } catch { /* Storage is optional; ordinary links and the SSR window remain usable. */ }
      }
      notify();
      return () => {};
    },
  };
}
