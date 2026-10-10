import { afterEach, describe, expect, it, vi } from 'vitest';
import { preloadGalleryAssets } from './preload';

class TestImage {
  static created: TestImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  decode = vi.fn(async () => {});
  removeAttribute = vi.fn(() => { this.src = ''; });
  constructor() { TestImage.created.push(this); }
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); TestImage.created = []; });

describe('atomic image preparation', () => {
  it('deduplicates URLs and waits for decode, not just a successful download', async () => {
    vi.stubGlobal('Image', TestImage);
    let decoded = false;
    const request = preloadGalleryAssets(['a', 'a', 'b'], new AbortController().signal, 7000).then(() => { decoded = true; });
    expect(TestImage.created).toHaveLength(2);
    TestImage.created[0].onload?.();
    await Promise.resolve();
    expect(decoded).toBe(false);
    TestImage.created[1].onload?.();
    await request;
    expect(TestImage.created.every((image) => image.decode.mock.calls.length === 1 && image.onload === null)).toBe(true);
  });
  it('rejects a failed configured cover and releases the remaining preparation', async () => {
    vi.stubGlobal('Image', TestImage);
    const request = preloadGalleryAssets(['a', 'b'], new AbortController().signal, 7000);
    const failed = expect(request).rejects.toThrow('无法读取');
    TestImage.created[0].onerror?.();
    await failed;
    expect(TestImage.created[1].removeAttribute).toHaveBeenCalled();
    expect(TestImage.created[1].onload).toBeNull();
  });
  it('cancels pending sources and prevents late success after route disposal', async () => {
    vi.stubGlobal('Image', TestImage);
    const abort = new AbortController();
    const request = preloadGalleryAssets(['a'], abort.signal, 7000);
    const failed = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    await failed;
    expect(TestImage.created[0].src).toBe('');
    expect(TestImage.created[0].onload).toBeNull();
  });
  it('bounds preparation to seven seconds and releases image handlers on timeout', async () => {
    vi.stubGlobal('Image', TestImage); vi.useFakeTimers();
    const request = preloadGalleryAssets(['a'], new AbortController().signal, 7000);
    const failed = expect(request).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(7000);
    await failed;
    expect(TestImage.created[0].onerror).toBeNull();
  });
});
