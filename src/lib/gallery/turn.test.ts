import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGalleryTurn } from './turn';
import type { GalleryItem } from './types';

vi.mock('./volume', () => ({ volumeAssets: () => ['next-cover'] }));
class Root extends EventTarget {
  dataset: Record<string, string> = {};
  scrollTop = 120;
  querySelector() { return null; }
}
class ImageSource {
  static images: ImageSource[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  decode = async () => {};
  removeAttribute() { this.src = ''; }
  constructor() { ImageSource.images.push(this); }
}

function setup() {
  const root = new Root();
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = new EventTarget();
  const media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('Image', ImageSource);
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  vi.stubGlobal('matchMedia', () => media);
  const items: GalleryItem[] = Array.from({ length: 10 }, (_, index) => ({ id: `test-${index}`, title: '测试', cover: '/cover' }));
  const onChange = vi.fn();
  const turn = createGalleryTurn({ root: root as unknown as HTMLElement, dialog: { open: false } as HTMLDialogElement, input: { items, desktop: true, active: true }, onChange });
  return { root, document, window, items, turn, onChange };
}

afterEach(() => { vi.unstubAllGlobals(); ImageSource.images = []; });

describe('volume preparation lifecycle', () => {
  it('cancels pending preparation when data changes and rejects its late decode', async () => {
    const { turn, items, onChange } = setup();
    const request = turn.setPage(1);
    const late = ImageSource.images[0].onload!;
    turn.update({ items: [...items], desktop: true, active: true });
    expect(await request).toBe(false);
    late(); await Promise.resolve(); await Promise.resolve();
    expect(ImageSource.images[0].src).toBe('');
    expect(onChange).toHaveBeenLastCalledWith({ page: 0, incoming: null, status: 'idle', error: '', message: '' });
    turn.destroy();
  });
  it('cancels on page hiding and preserves the original committed page and scroll', async () => {
    const { turn, root, document, onChange } = setup();
    const request = turn.nextBatch();
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(await request).toBe(false);
    expect(root.scrollTop).toBe(120);
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ page: 0, incoming: null, status: 'idle' });
    expect(ImageSource.images[0].onload).toBeNull();
    turn.destroy();
  });
  it('ignores concurrent commands and releases pending media on unmount without notifying removed UI', async () => {
    const { turn, onChange } = setup();
    const request = turn.nextBatch();
    expect(await turn.nextBatch()).toBe(false);
    expect(ImageSource.images).toHaveLength(1);
    const changes = onChange.mock.calls.length;
    turn.destroy();
    expect(await request).toBe(false);
    expect(onChange.mock.calls).toHaveLength(changes);
    expect(ImageSource.images[0].src).toBe('');
  });
});
