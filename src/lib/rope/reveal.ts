import { revealGeometry, updateReveal, type RevealState } from './reveal-state';
import type { RopeEntry } from './entry';
import type { RopeSnapshot } from './types';
import type { PeelSurface } from '@/lib/peel/surface';
import { leisurePullSettings } from './leisure-pull';
import type { StagePhase } from '@/lib/stage/types';

type RevealElements = {
  root: HTMLDivElement;
  content: HTMLDivElement;
  face: HTMLDivElement;
  backdrop: HTMLDivElement;
  rope: HTMLDivElement;
  returnButton: HTMLButtonElement;
  clip: SVGPathElement;
  shadow: SVGPathElement;
  shadowSvg: SVGSVGElement;
  clipId: string;
  canvas: HTMLCanvasElement;
  onStageChange?: (phase: StagePhase) => void;
};

function preserveStyles(style: CSSStyleDeclaration, properties: string[]) {
  const values = properties.map((property) => [property, style.getPropertyValue(property), style.getPropertyPriority(property)]);
  return () => {
    for (const [property, value, priority] of values) {
      if (value) style.setProperty(property, value, priority);
      else style.removeProperty(property);
    }
  };
}

/** Owns only the reveal DOM, scroll lock and closing RAF; rope physics stays independent. */
export function createRevealController(elements: RevealElements) {
  const { root, content, face, backdrop, rope, returnButton, clip, shadow, shadowSvg, canvas } = elements;
  const events = new AbortController();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 901px)');
  const state: RevealState = { phase: 'idle', progress: 0 };
  let entry: RopeEntry | null = null;
  let peel: PeelSurface | null = null;
  let loadingPeel = false;
  let side = 0;
  let disposed = false;
  let frame: number | null = null;
  let width = 0;
  let height = 0;
  let scrollY = 0;
  let scrollbar = 0;
  let restoreScroll: (() => void) | null = null;

  function paint(progress: number) {
    state.progress = progress;
    root.dataset.revealProgress = String(progress);
    root.style.setProperty('--reveal-progress', String(progress));
    if (root.dataset.revealRenderer === 'peel' && peel?.draw(progress, side)) return;
    root.dataset.revealRenderer = 'lift';
    if (restoreScroll) face.style.clipPath = `url(#${elements.clipId})`;
    const geometry = revealGeometry(progress, width, height);
    root.style.setProperty('--reveal-lift', `${geometry.lift}px`);
    clip.setAttribute('d', geometry.clip);
    shadow.setAttribute('d', geometry.shadow);
    shadowSvg.style.opacity = String(geometry.shadowOpacity);
  }

  function setPhase(phase: RevealState['phase']) {
    state.phase = phase;
    root.dataset.revealPhase = phase;
  }

  function measure() {
    width = window.innerWidth - scrollbar;
    height = window.innerHeight;
    root.style.setProperty('--reveal-width', `${width}px`);
    root.style.setProperty('--reveal-height', `${height}px`);
    shadowSvg.setAttribute('viewBox', `0 0 ${width} ${height + 24}`);
    shadowSvg.style.height = `${height + 24}px`;
  }

  function begin() {
    if (restoreScroll) return;
    // Freeze the choice for this gesture; asynchronous preparation never swaps it mid-pull.
    root.dataset.revealRenderer = desktop.matches && !motion.matches && peel?.ready() ? 'peel' : 'lift';
    const body = document.body;
    const html = document.documentElement;
    scrollY = window.scrollY;
    scrollbar = window.innerWidth - html.clientWidth;
    const ropeTop = rope.getBoundingClientRect().top;
    const contentHeight = content.getBoundingClientRect().height;
    const restoreBody = preserveStyles(body.style, ['position', 'top', 'left', 'right', 'width', 'overflow', 'padding-right']);
    const restoreHtml = preserveStyles(html.style, ['overflow']);
    const skipLink = document.querySelector<HTMLElement>('.skip-link');
    const skipWasInert = skipLink?.inert ?? false;
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    restoreScroll = () => {
      restoreBody();
      restoreHtml();
      if (skipLink) skipLink.inert = skipWasInert;
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
    measure();
    root.style.height = `${contentHeight}px`;
    root.style.setProperty('--reveal-scroll', `${-scrollY}px`);
    rope.style.top = `${ropeTop}px`;
    face.style.clipPath = `url(#${elements.clipId})`;
    face.inert = true;
    backdrop.inert = true;
    setPhase('dragging');
    Object.assign(body.style, {
      position: 'fixed', top: `${-scrollY}px`, left: '0', right: '0',
      width: '100%', overflow: 'hidden', paddingRight: `${padding + scrollbar}px`,
    });
    html.style.overflow = 'hidden';
    if (skipLink) skipLink.inert = true;
    elements.onStageChange?.('preview');
  }

  function reset(focus = false, resetRope = true) {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    elements.onStageChange?.('closed');
    setPhase('idle');
    paint(0);
    root.style.height = '';
    root.style.removeProperty('--reveal-scroll');
    rope.style.top = '';
    rope.hidden = false;
    rope.inert = false;
    face.style.clipPath = '';
    face.inert = false;
    backdrop.inert = true;
    returnButton.hidden = true;
    returnButton.disabled = false;
    const restore = restoreScroll;
    restoreScroll = null;
    restore?.();
    side = 0;
    peel?.prepare();
    if (resetRope) entry?.reset();
    if (focus) rope.querySelector<HTMLButtonElement>('.mutou-rope-handle')?.focus({ preventScroll: true });
  }

  function update(snapshot: RopeSnapshot) {
    if (disposed) return;
    if (state.phase === 'committed' || state.phase === 'closing') return;
    side = (snapshot.endpoint.x - (snapshot.nodes[0]?.x ?? snapshot.endpoint.x)) / 75;
    const next = updateReveal(state, snapshot, entry?.triggerDistance ?? leisurePullSettings(window.innerWidth).triggerDistance);
    if (next.phase === 'idle') {
      if (state.phase !== 'idle') reset(false, false);
      return;
    }
    if (state.phase === 'idle') begin();
    setPhase(next.phase);
    paint(next.progress);
  }

  function commit() {
    if (disposed || state.phase === 'committed' || state.phase === 'closing') return;
    begin();
    setPhase('committed');
    paint(1);
    backdrop.inert = false;
    rope.inert = true;
    rope.hidden = true;
    returnButton.hidden = false;
    returnButton.focus({ preventScroll: true });
    elements.onStageChange?.('open');
  }

  function close() {
    if (state.phase !== 'committed') return;
    returnButton.disabled = true;
    backdrop.inert = true;
    setPhase('closing');
    elements.onStageChange?.('closing');
    if (motion.matches) {
      reset(true);
      return;
    }
    const start = performance.now();
    const tick = (time: number) => {
      frame = null;
      if (disposed) return;
      const fraction = Math.min(1, (time - start) / 260);
      paint(1 - fraction);
      if (fraction === 1) reset(true);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  async function enablePeel() {
    if (disposed || peel || loadingPeel || !desktop.matches || motion.matches) return;
    loadingPeel = true;
    try {
      const { createPeelSurface } = await import('@/lib/peel/surface');
      if (disposed) return;
      peel = createPeelSurface({
        root, content, face, canvas,
        isIdle: () => state.phase === 'idle',
        isEnabled: () => desktop.matches && !motion.matches && !document.hidden,
        onFailure() {
          root.dataset.revealRenderer = 'lift';
          if (state.phase !== 'idle') paint(state.progress);
        },
      });
    } catch {
      root.dataset.peelStatus = 'fallback';
    } finally {
      loadingPeel = false;
    }
  }

  const { signal } = events;
  void enablePeel();
  desktop.addEventListener('change', () => { void enablePeel(); peel?.prepare(); }, { signal });
  returnButton.addEventListener('click', close, { signal });
  window.addEventListener('resize', () => {
    if (state.phase === 'committed' || state.phase === 'closing') {
      root.dataset.revealRenderer = 'lift';
      measure();
      paint(state.progress);
    } else if (state.phase !== 'idle') reset();
  }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
    else peel?.prepare();
  }, { signal });
  window.addEventListener('pagehide', () => reset(), { signal });
  window.addEventListener('beforeprint', () => reset(), { signal });
  motion.addEventListener('change', () => {
    if (state.phase === 'closing' || state.phase === 'dragging' || state.phase === 'returning') reset();
    void enablePeel();
    peel?.prepare();
  }, { signal });

  return {
    update,
    commit,
    reset,
    bind(instance: RopeEntry | null) { entry = instance; },
    destroy() {
      if (disposed) return;
      disposed = true;
      events.abort();
      reset();
      peel?.destroy();
      peel = null;
      entry = null;
    },
  };
}
