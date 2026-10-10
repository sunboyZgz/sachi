import { album, frames, layout } from './config';
import { galleryFrames } from './assets';
import { gallerySlots } from './items';
import type { GalleryItem } from './types';

export function volumeWorks(items: readonly GalleryItem[], page: number, desktop: boolean) {
  const shown = items.slice(page * layout.pageSize, (page + 1) * layout.pageSize);
  const slots = gallerySlots(shown.length, layout.slots, album, layout.sceneSize[0]);
  return shown.map((item, index) => ({
    item, slot: slots[index], index: page * layout.pageSize + index,
    frame: desktop ? frames.find((frame) => frame.id === slots[index].frame)! : album,
  }));
}

export function volumeAssets(items: readonly GalleryItem[], page: number, desktop: boolean) {
  return volumeWorks(items, page, desktop).flatMap(({ item, frame }) => {
    const material = galleryFrames.get(frame.id)!;
    return [material.art.src, material.shadow.src, ...(item.cover ? [item.cover] : [])];
  });
}
