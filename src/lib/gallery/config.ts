import frameData from './frames.json';
import layoutData from './layout.json';
import type { GalleryFrame, GalleryRect, GallerySlot } from './types';

function rect(value: readonly number[]): GalleryRect {
  if (value.length !== 4 || value.some((part) => !Number.isFinite(part)) || value[2] <= 0 || value[3] <= 0) throw new Error('装裱矩形无效');
  return [value[0], value[1], value[2], value[3]];
}

export const frames: readonly GalleryFrame[] = frameData.map((frame) => {
  if (frame.size.length !== 2 || frame.size.some((part) => !Number.isFinite(part) || part <= 0)) throw new Error('装裱尺寸无效');
  const size: [number, number] = [frame.size[0], frame.size[1]];
  for (const box of [frame.cover, frame.title, frame.number]) {
    const [x, y, width, height] = rect(box);
    if (x < 0 || y < 0 || x + width > size[0] || y + height > size[1]) throw new Error('装裱开口越界');
  }
  return { ...frame, size, cover: rect(frame.cover), number: rect(frame.number), title: rect(frame.title) };
});

export const layout = {
  ...layoutData,
  sceneSize: [layoutData.sceneSize[0], layoutData.sceneSize[1]] as const,
  slots: layoutData.slots.map((slot): GallerySlot => {
    if (!frames.some((frame) => frame.id === slot.frame)) throw new Error('展墙引用了未知装裱');
    return { frame: slot.frame, rect: rect(slot.rect) };
  }),
};
export const album = frames.find((frame) => frame.id === layout.mobile.frame)!;
