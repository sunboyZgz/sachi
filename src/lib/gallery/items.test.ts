import { describe, expect, it } from 'vitest';
import { album, frames, layout } from './config';
import { galleryAsset, gallerySlots, normalizeGalleryItems, projectUrl } from './items';

const item = { id: 'one', title: '真实文字', cover: '/assets/cover.webp' };

describe('mounted gallery data', () => {
  it('rejects repeated identities and disallows executable project/media URLs', () => {
    expect(() => normalizeGalleryItems([item, item])).toThrow('唯一');
    expect(() => normalizeGalleryItems([{ ...item, id: '' }])).toThrow('非空');
    for (const url of ['javascript:alert(1)', 'data:text/html,test', '//example.com/', 'file:///tmp/a.mp4']) {
      expect(projectUrl(url)).toBeNull();
      expect(galleryAsset(url)).toBeNull();
    }
    expect(projectUrl('https://example.com/work')).toBe('https://example.com/work');
  });
  it('keeps a missing video/link absent and clamps cover alignment without stretching', () => {
    const [work] = normalizeGalleryItems([{ ...item, coverFit: 'contain', coverPosition: [-10, 120] }]);
    expect(work).toMatchObject({ coverFit: 'contain', coverPosition: [0, 100], projectUrl: null, video: null });
  });
  it('applies the release resource prefix once and preserves imported image URLs', () => {
    const old = process.env.NEXT_PUBLIC_BLOG_ASSET_PREFIX;
    process.env.NEXT_PUBLIC_BLOG_ASSET_PREFIX = '/blog/versions/test';
    try {
      expect(galleryAsset('/assets/cover.webp')).toBe('/blog/versions/test/assets/cover.webp');
      expect(galleryAsset('/blog/versions/test/_next/static/media/frame.hash.webp')).toBe('/blog/versions/test/_next/static/media/frame.hash.webp');
      expect(galleryAsset('https://cdn.example.com/cover.webp')).toBe('https://cdn.example.com/cover.webp');
    } finally {
      if (old === undefined) delete process.env.NEXT_PUBLIC_BLOG_ASSET_PREFIX;
      else process.env.NEXT_PUBLIC_BLOG_ASSET_PREFIX = old;
    }
  });
  it('preserves the handoff frame proportions and aperture bounds', () => {
    expect(frames).toHaveLength(7);
    for (const slot of layout.slots) {
      const frame = frames.find((frame) => frame.id === slot.frame)!;
      expect(slot.rect[2] / slot.rect[3]).toBeCloseTo(frame.size[0] / frame.size[1], 3);
      for (const box of [frame.cover, frame.title, frame.number]) {
        expect(box[0] + box[2]).toBeLessThanOrEqual(frame.size[0]);
        expect(box[1] + box[3]).toBeLessThanOrEqual(frame.size[1]);
      }
    }
  });
  it('centers one to three actual works without adding empty mounts', () => {
    expect(gallerySlots(0, layout.slots, album, 1586)).toEqual([]);
    for (const count of [1, 2, 3]) {
      const slots = gallerySlots(count, layout.slots, album, 1586);
      expect(slots).toHaveLength(count);
      expect(slots[0].rect[0]).toBeCloseTo(1586 - slots.at(-1)!.rect[0] - slots.at(-1)!.rect[2]);
    }
    expect(gallerySlots(7, layout.slots, album, 1586)).toEqual(layout.slots);
  });
});
