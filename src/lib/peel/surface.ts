import { toCanvas } from 'html-to-image';
import { createPeelRenderer, type PeelRenderer } from './renderer';

type SurfaceElements = {
  root: HTMLDivElement;
  content: HTMLDivElement;
  face: HTMLDivElement;
  canvas: HTMLCanvasElement;
  isIdle: () => boolean;
  isEnabled: () => boolean;
  onFailure: () => void;
};

/** Capture once at rest; never clone DOM, upload textures or await work during a drag. */
export function createPeelSurface({ root, content, face, canvas, isIdle, isEnabled, onFailure }: SurfaceElements) {
  const events = new AbortController();
  let renderer: PeelRenderer | null = null;
  let revision = 0;
  let capturedKey = '';
  let pending = false;
  let disposed = false;
  let lost = false;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let capture: AbortController | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;

  function key() {
    return `${document.documentElement.clientWidth}:${innerHeight}:${scrollY}:${content.getBoundingClientRect().height}:${revision}`;
  }

  function release() {
    renderer?.destroy();
    renderer = null;
    capturedKey = '';
  }

  function fail() {
    release();
    root.dataset.peelStatus = 'fallback';
    onFailure();
  }

  async function prepare() {
    if (disposed || pending || lost || !isIdle() || !isEnabled()) return;
    const captureKey = key();
    if (renderer && capturedKey === captureKey) return;
    pending = true;
    const task = new AbortController();
    capture = task;
    release();
    root.dataset.peelStatus = 'preparing';
    const expired = { value: false };
    deadline = setTimeout(() => {
      expired.value = true;
      task.abort();
      deadline = null;
      if (!disposed) fail();
    }, 2500);
    let image: HTMLCanvasElement | null = null;
    const aborted = new Promise<never>((_, reject) => {
      task.signal.addEventListener('abort', () => reject(new DOMException('Capture cancelled', 'AbortError')), { once: true });
    });
    try {
      await Promise.race([Promise.all([document.fonts.ready, ...Array.from(content.querySelectorAll('img'), (img) => img.decode())]), aborted]);
      if (disposed || expired.value || !isIdle() || key() !== captureKey) return;
      const width = document.documentElement.clientWidth;
      const height = innerHeight;
      const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
      const snapshot = toCanvas(content, {
        width, height, backgroundColor: paper, pixelRatio: Math.min(2, Math.max(1.5, devicePixelRatio)),
        // The blog uses system fonts; preserve the real computed layout without fetching font files.
        fontEmbedCSS: '', includeQueryParams: true, fetchRequestInit: { signal: task.signal },
        style: { transform: `translateY(${content.getBoundingClientRect().top}px)`, transformOrigin: 'top left' },
      });
      // Release any late raster even when timeout/unmount already won the race.
      void snapshot.then((lateImage) => {
        if (task.signal.aborted) lateImage.width = lateImage.height = 0;
      }, () => {});
      image = await Promise.race([snapshot, aborted]);
      if (disposed || expired.value || !isIdle() || !isEnabled() || key() !== captureKey) return;
      renderer = createPeelRenderer(canvas, image, width, height, paper);
      capturedKey = captureKey;
      root.dataset.peelStatus = 'ready';
    } catch {
      if (!disposed && !expired.value) fail();
    } finally {
      if (image) image.width = image.height = 0;
      if (deadline !== null) clearTimeout(deadline);
      deadline = null;
      pending = false;
      capture = null;
      // An idle scroll/resize during an asynchronous capture invalidates that capture.
      if (!disposed && !expired.value && isIdle() && key() !== captureKey) schedule();
    }
  }

  function schedule() {
    if (isIdle() && isEnabled() && (!renderer || capturedKey !== key())) root.dataset.peelStatus = 'preparing';
    if (debounce !== null) clearTimeout(debounce);
    debounce = setTimeout(() => { debounce = null; void prepare(); }, 120);
  }

  function invalidate() {
    revision++;
    if (isIdle()) schedule();
  }

  const { signal } = events;
  window.addEventListener('scroll', schedule, { passive: true, signal });
  window.addEventListener('resize', invalidate, { signal });
  content.addEventListener('load', invalidate, { capture: true, signal });
  document.fonts.addEventListener('loadingdone', invalidate, { signal });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    fail();
  }, { signal });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    invalidate();
  }, { signal });
  const resize = new ResizeObserver(invalidate);
  resize.observe(content);
  const mutations = new MutationObserver(invalidate);
  // Ignore the controller's transforms and inert attributes; track article/image changes.
  mutations.observe(content, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'srcset'] });
  schedule();

  return {
    ready: () => !disposed && !lost && renderer !== null && capturedKey === key(),
    draw(progress: number, side: number) {
      if (!renderer) return false;
      try {
        face.style.clipPath = renderer.draw(progress, side);
        return true;
      } catch {
        fail();
        return false;
      }
    },
    prepare: schedule,
    destroy() {
      disposed = true;
      events.abort();
      capture?.abort();
      resize.disconnect();
      mutations.disconnect();
      if (debounce !== null) clearTimeout(debounce);
      if (deadline !== null) clearTimeout(deadline);
      release();
      canvas.width = canvas.height = 0;
    },
  };
}

export type PeelSurface = ReturnType<typeof createPeelSurface>;
