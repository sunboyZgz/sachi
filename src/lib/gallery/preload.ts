/** Keeps the old volume intact until every configured image has decoded. */
export async function preloadGalleryAssets(urls: readonly string[], signal: AbortSignal, timeout: number): Promise<void> {
  const loading = new AbortController();
  const cancel = () => loading.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(() => loading.abort(new Error('下一卷素材读取超时')), timeout);
  try {
    await Promise.all([...new Set(urls)].map((src) => new Promise<void>((resolve, reject) => {
      const image = new Image();
      let finished = false;
      const cleanup = () => {
        image.onload = image.onerror = null;
        loading.signal.removeEventListener('abort', abort);
      };
      const complete = (error?: unknown) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const abort = () => {
        image.removeAttribute('src');
        complete(loading.signal.reason ?? new DOMException('换卷已取消', 'AbortError'));
      };
      loading.signal.addEventListener('abort', abort, { once: true });
      image.onerror = () => complete(new Error('下一卷素材无法读取'));
      image.onload = () => { void image.decode().then(() => complete(), complete); };
      if (loading.signal.aborted) abort();
      else image.src = src;
    })));
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    loading.abort();
  }
}
