import { clearTurn, paintTurn, sampleTurn, scheduleTurn, turnSettings } from './turn-motion';
import { preloadGalleryAssets } from './preload';
import { volumeAssets } from './volume';
import { layout } from './config';
import type { GalleryItem } from './types';

export type TurnView = {
  page: number;
  incoming: number | null;
  status: 'idle' | 'loading' | 'animating';
  error: string;
  message: string;
};
type TurnInput = { items: readonly GalleryItem[]; desktop: boolean; active: boolean };
type Transaction = {
  target: number;
  abort: AbortController;
  resolve: (changed: boolean) => void;
  scroll: number;
  started: boolean;
  frame: number | null;
};

/** Owns an atomic volume switch, not the ambient scene or the article scroll lock. */
export function createGalleryTurn(options: {
  root: HTMLElement;
  dialog: HTMLDialogElement;
  input: TurnInput;
  onChange: (view: TurnView) => void;
}) {
  const { root, dialog, onChange } = options;
  const events = new AbortController();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let input = options.input, disposed = false;
  let view: TurnView = { page: 0, incoming: null, status: 'idle', error: '', message: '' };
  let transaction: Transaction | null = null;
  const pages = () => Math.max(1, Math.ceil(input.items.length / layout.pageSize));
  const cards = (volume: Element | null) => [...volume?.querySelectorAll<HTMLElement>('.toy-mount') ?? []];
  const current = () => root.querySelector<HTMLElement>('.toy-volume:not([data-incoming])');
  const incoming = () => root.querySelector<HTMLElement>('.toy-volume[data-incoming]');

  function notify(next: TurnView) {
    view = next;
    root.dataset.turn = next.status;
    onChange(next);
  }

  function clearLayers() {
    for (const card of cards(current())) clearTurn(card);
    const old = current();
    if (old) { old.inert = false; old.removeAttribute('aria-hidden'); }
    root.querySelector<HTMLElement>('.toy-exhibits')?.style.removeProperty('min-height');
  }

  function cancel(message = '已取消换卷', error = '') {
    const tx = transaction;
    if (!tx) return false;
    transaction = null;
    tx.abort.abort();
    if (tx.frame !== null) cancelAnimationFrame(tx.frame);
    clearLayers();
    root.dataset.turnResult = 'cancelled';
    root.dataset.turnProgress = '0';
    if (!disposed) notify({ ...view, incoming: null, status: 'idle', error, message });
    root.scrollTop = tx.scroll;
    tx.resolve(false);
    return true;
  }

  function commit(tx: Transaction) {
    if (disposed || transaction !== tx) return;
    transaction = null;
    const next = incoming();
    for (const card of cards(next)) clearTurn(card);
    if (next) { next.inert = false; next.removeAttribute('aria-hidden'); }
    root.querySelector<HTMLElement>('.toy-exhibits')?.style.removeProperty('min-height');
    root.dataset.turnResult = 'committed';
    root.dataset.turnProgress = '1';
    notify({ page: tx.target, incoming: null, status: 'idle', error: '', message: `第 ${tx.target + 1} 卷已展开，共 ${pages()} 卷。` });
    // The keyed incoming list becomes the current list without remounting its buttons.
    if (!input.desktop) next?.querySelector<HTMLButtonElement>('.toy-cover-button')?.focus({ preventScroll: true });
    tx.resolve(true);
  }

  function startAnimation() {
    const tx = transaction;
    if (!tx || tx.started || view.status !== 'animating') return;
    const old = current(), next = incoming(), exhibits = root.querySelector<HTMLElement>('.toy-exhibits');
    if (!old || !next || !exhibits) return;
    tx.started = true;
    const oldCards = cards(old), newCards = cards(next);
    old.inert = next.inert = true;
    old.setAttribute('aria-hidden', 'true');
    next.setAttribute('aria-hidden', 'true');
    exhibits.style.minHeight = `${Math.ceil(Math.max(old.getBoundingClientRect().height, next.getBoundingClientRect().height))}px`;
    const schedule = scheduleTurn(Math.max(oldCards.length, newCards.length));
    const draw = (time: number) => {
      root.dataset.turnProgress = String(Math.min(1, time / schedule.total));
      schedule.slots.forEach((slot, index) => {
        const sample = sampleTurn(time, slot);
        if (oldCards[index]) paintTurn(oldCards[index], sample.oldOpen, false);
        if (newCards[index]) paintTurn(newCards[index], sample.newOpen, true);
      });
    };
    draw(0);
    next.style.removeProperty('visibility');
    if (!input.desktop) root.scrollTo({ top: 0, behavior: 'instant' });
    if (motion.matches) { commit(tx); return; }
    let previous = performance.now(), elapsed = 0;
    const tick = (now: number) => {
      tx.frame = null;
      if (transaction !== tx || disposed) return;
      elapsed += Math.min(80, Math.max(0, now - previous));
      previous = now;
      draw(elapsed);
      if (elapsed >= schedule.total) commit(tx);
      else tx.frame = requestAnimationFrame(tick);
    };
    tx.frame = requestAnimationFrame(tick);
  }

  function setPage(target: number): Promise<boolean> {
    if (disposed || transaction || !input.active || dialog.open || !Number.isInteger(target) || target < 0 || target >= pages() || target === view.page) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const tx: Transaction = { target, abort: new AbortController(), resolve, scroll: root.scrollTop, frame: null, started: false };
      transaction = tx;
      root.dataset.turnResult = '';
      const old = current();
      if (old) old.inert = true;
      root.querySelector<HTMLButtonElement>('.toy-next-volume')?.focus({ preventScroll: true });
      notify({ ...view, incoming: null, status: 'loading', error: '', message: `正在准备第 ${target + 1} 卷。按 Esc 可取消。` });
      void preloadGalleryAssets(volumeAssets(input.items, target, input.desktop), tx.abort.signal, turnSettings.preloadTimeout).then(() => {
        if (disposed || transaction !== tx) return;
        notify({ ...view, incoming: target, status: 'animating', message: `正在展开第 ${target + 1} 卷。按 Esc 可取消。` });
      }).catch(() => {
        if (transaction === tx && !disposed) cancel('下卷未备妥，仍留此卷。', '下卷未备妥，仍留此卷。请重试。');
      });
    });
  }

  const { signal } = events;
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && transaction) { event.preventDefault(); cancel(); }
  }, { signal });
  // Cancels before the reveal controller's native return-button click listener.
  root.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.leisure-reveal-return')) cancel('返回文章');
  }, { capture: true, signal });
  window.addEventListener('resize', () => cancel('尺寸变化，仍留此卷。'), { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel('页面已隐藏'); }, { signal });
  window.addEventListener('pagehide', () => cancel('离开页面'), { signal });
  window.addEventListener('beforeprint', () => cancel('打印原栏目'), { signal });
  motion.addEventListener('change', () => cancel('动态偏好变化，仍留此卷。'), { signal });

  return {
    setPage,
    nextBatch: () => setPage((view.page + 1) % pages()),
    previous: () => setPage(view.page - 1),
    cancel,
    startAnimation,
    idle: () => transaction === null,
    update(next: TurnInput) {
      const changed = next.items !== input.items;
      if (changed || !next.active || next.desktop !== input.desktop) cancel(changed ? '作品数据已更新' : '操作已取消');
      input = next;
      if (changed) notify({ page: 0, incoming: null, status: 'idle', error: '', message: '' });
    },
    destroy() {
      disposed = true;
      cancel('离开页面');
      events.abort();
    },
  };
}
