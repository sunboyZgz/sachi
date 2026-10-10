import { siteAsset } from '@/config/site';
import type { GalleryFrame, GalleryItem, GalleryRect, GallerySlot } from './types';

export function projectUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/** Local media follows the same Pages/CDN prefix as the rest of the blog. */
export function galleryAsset(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value.includes('/_next/static/media/') ? value : siteAsset(value);
  return projectUrl(value);
}

export function normalizeGalleryItems(items: readonly GalleryItem[]): GalleryItem[] {
  const ids = new Set<string>();
  return items.map((item) => {
    if (!item.id.trim() || ids.has(item.id)) throw new Error('作品 id 必须非空且唯一');
    ids.add(item.id);
    const position = item.coverPosition ?? [50, 50];
    const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
    return {
      ...item, title: item.title.trim() || '未命名作品',
      cover: galleryAsset(item.cover) ?? '', video: galleryAsset(item.video),
      coverFit: item.coverFit === 'contain' ? 'contain' : 'cover',
      coverPosition: [clamp(position[0]), clamp(position[1])],
      projectUrl: projectUrl(item.projectUrl),
    };
  });
}

export function gallerySlots(count: number, configured: readonly GallerySlot[], album: GalleryFrame, sceneWidth: number): GallerySlot[] {
  if (count > 3) return configured.slice(0, count);
  const width = count === 1 ? 340 : 280, gap = 62;
  const total = count * width + Math.max(0, count - 1) * gap;
  return Array.from({ length: count }, (_, index) => ({
    frame: album.id,
    rect: [(sceneWidth - total) / 2 + index * (width + gap), 300, width, width * album.size[1] / album.size[0]],
  }));
}

export function rectPercent(rect: GalleryRect, size: readonly [number, number]) {
  return { left: `${rect[0] / size[0] * 100}%`, top: `${rect[1] / size[1] * 100}%`, width: `${rect[2] / size[0] * 100}%`, height: `${rect[3] / size[1] * 100}%` };
}
