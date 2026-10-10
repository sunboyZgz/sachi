import room from '@/assets/stage/room-base.webp';
import bamboo from '@/assets/stage/bamboo.webp';
import pine from '@/assets/stage/pine-plum.webp';
import wall from '@/assets/stage/wall-receiver.png';
import floor from '@/assets/stage/floor-receiver.png';
import desk from '@/assets/stage/desk-receiver.png';
import { sceneConfig } from './config';
import { SceneRenderer } from './renderer';
import { nextRenderBudget } from './budget';
import type { SceneImages } from './types';

const sources = { room: room.src, bamboo: bamboo.src, 'pine-plum': pine.src, wall: wall.src, floor: floor.src, desk: desk.src };

function loadImage(src: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = image.onerror = null;
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      image.removeAttribute('src');
      reject(new DOMException('Scene disposed', 'AbortError'));
    };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error('书斋素材读取失败')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else image.src = src;
  });
}

/** Owns the ambient clock; preview and reveal use the same foliage and shadows. */
export function createWindScene(host: HTMLDivElement) {
  const events = new AbortController(), { signal } = events;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  canvas.className = 'wind-scene-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = true;
  canvas.width = canvas.height = 0;
  host.append(canvas);
  host.dataset.sceneStatus = 'loading';
  host.dataset.sceneStrength = String(sceneConfig.strength);
  let renderer: SceneRenderer | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let modalObserver: MutationObserver | null = null;
  let disposed = false, failed = false, active = true, offscreen = false, modal = false;
  let reducedMotion = motion.matches;
  let time = 0, frameCount = 0, frame: number | null = null, last = 0, lastDraw = 0;
  let renderBudget = sceneConfig.maxWidth, averageSubmitMs = 0, budgetSamples = 0;

  function running() {
    return !!renderer && !disposed && !failed && active && !reducedMotion && !offscreen && !modal && !document.hidden;
  }

  function notify() {
    host.dataset.sceneRunning = String(running());
    host.dataset.sceneReducedMotion = String(reducedMotion);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    last = lastDraw = 0;
  }

  function fail() {
    if (disposed) return;
    failed = true;
    stop();
    renderer?.destroy();
    renderer = null;
    canvas.hidden = true;
    host.dataset.sceneStatus = 'static';
    notify();
  }

  function render() {
    if (!renderer || disposed) return;
    try {
      const start = performance.now();
      renderer.render(time);
      host.dataset.sceneTime = String(time);
      host.dataset.shadowTime = String(time);
      host.dataset.sceneFrames = String(++frameCount);
      const spent = performance.now() - start;
      host.dataset.sceneSubmitMs = String(spent);
      averageSubmitMs = budgetSamples ? averageSubmitMs * .8 + spent * .2 : spent;
      budgetSamples++;
    } catch { fail(); }
  }

  function tick(now: number) {
    frame = null;
    reducedMotion = motion.matches;
    if (!running()) { notify(); return; }
    time += Math.min(Math.max((now - last) / 1000, 0), .05);
    last = now;
    if (now - lastDraw >= 1000 / sceneConfig.targetFps - 1) {
      lastDraw = now;
      render();
      const budget = nextRenderBudget(renderBudget, canvas.width, averageSubmitMs, budgetSamples);
      if (budget !== renderBudget) {
        renderBudget = budget;
        budgetSamples = 0;
        resize();
      }
    }
    if (running()) frame = requestAnimationFrame(tick);
  }

  function schedule() {
    if (!running()) stop();
    else if (frame === null) {
      last = performance.now();
      lastDraw = 0;
      frame = requestAnimationFrame(tick);
    }
    notify();
  }

  function resize() {
    if (!renderer || disposed) return;
    const width = Math.max(1, Math.min(renderBudget, Math.round(host.clientWidth * Math.min(devicePixelRatio || 1, sceneConfig.dprCap))));
    if (canvas.width === width) return;
    try {
      renderer.resize(width);
      host.dataset.sceneRenderBudget = String(renderBudget);
      render();
    } catch { fail(); }
  }

  function checkModal() {
    const next = [...document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"]')]
      .some((node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length > 0);
    if (next !== modal) { modal = next; schedule(); }
  }

  async function init() {
    try {
      const loaded = await Promise.all(Object.entries(sources).map(async ([key, src]) => [key, await loadImage(src, signal)] as const));
      if (disposed) return;
      renderer = new SceneRenderer(canvas, Object.fromEntries(loaded) as SceneImages, sceneConfig);
      resize();
      if (failed) return;
      canvas.hidden = false;
      host.dataset.sceneStatus = 'ready';
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      intersectionObserver = new IntersectionObserver(([entry]) => { offscreen = !entry.isIntersecting; schedule(); });
      intersectionObserver.observe(host);
      modalObserver = new MutationObserver(checkModal);
      modalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'hidden', 'aria-hidden', 'aria-modal'] });
      checkModal();
      schedule();
    } catch { fail(); }
  }

  document.addEventListener('visibilitychange', schedule, { signal });
  motion.addEventListener('change', (event) => {
    reducedMotion = event.matches;
    schedule();
  }, { signal });
  notify();
  void init();

  return {
    setActive(value: boolean) { active = value; schedule(); },
    destroy() {
      if (disposed) return;
      disposed = true;
      stop();
      events.abort();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      modalObserver?.disconnect();
      renderer?.destroy();
      renderer = null;
      canvas.remove();
      host.dataset.sceneStatus = 'disposed';
      host.dataset.sceneRunning = 'false';
    },
  };
}
