import { z } from 'zod';
import type { CSSProperties } from 'react';
import type { SourceRange } from './source-lines';

export const imageWindowSchema = z.strictObject({
  x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1), height: z.number().finite().positive().max(1),
}).refine((value) => value.x + value.width <= 1 + 1e-8 && value.y + value.height <= 1 + 1e-8, '图片窗口必须完整位于原图内。');
const reference = z.string().refine((value) => {
  try {
    const path = decodeURIComponent(value);
    return /^\.?\/assets\//u.test(path) && /\.(?:png|jpe?g|webp|avif|gif|svg)$/iu.test(path) && !/[\\\0?#]/u.test(path) && path.split('/').slice(2).every((part) => part && part !== '.' && part !== '..');
  } catch { return false; }
}, '图片窗口必须使用本篇 assets 内的原图片引用。');
export const imageWindowsSchema = z.record(reference, imageWindowSchema).superRefine((windows, context) => {
  const seen = new Set<string>();
  for (const key of Object.keys(windows)) {
    let normalized: string;
    try { normalized = decodeURIComponent(key).replace(/^\.\//u, '/'); } catch { continue; }
    if (seen.has(normalized)) context.addIssue({ code: 'custom', path: [key], message: '同一图片不能重复配置窗口。' });
    seen.add(normalized);
  }
});
export type ImageWindow = z.infer<typeof imageWindowSchema>;
export type ImageWindows = z.infer<typeof imageWindowsSchema>;
export const fullImageWindow: ImageWindow = { x: 0, y: 0, width: 1, height: 1 };
export type ImageCropTarget = { reference: string; url: string; label: string; window?: ImageWindow; source?: SourceRange; width?: number; height?: number };
export type ImageEditor = (target: ImageCropTarget) => void;

export function isFullImageWindow(value: ImageWindow) {
  return value.x === 0 && value.y === 0 && value.width === 1 && value.height === 1;
}
export function windowForImage(windows: ImageWindows | undefined, reference: string) {
  if (!windows) return undefined;
  const normalize = (value: string) => decodeURIComponent(value).replace(/^\.\//u, '/');
  try {
    const key = normalize(reference);
    return Object.entries(windows).find(([name]) => normalize(name) === key)?.[1];
  } catch { return undefined; }
}
export function imageWindowStyle(value: ImageWindow): CSSProperties {
  return { position: 'absolute', width: `${100 / value.width}%`, height: `${100 / value.height}%`, maxWidth: 'none',
    left: `${-100 * value.x / value.width}%`, top: `${-100 * value.y / value.height}%`, objectFit: 'fill', margin: 0 };
}
export function normalizeImageWindow(value: ImageWindow): ImageWindow {
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  const width = round(Math.max(.001, Math.min(1, value.width)));
  const height = round(Math.max(.001, Math.min(1, value.height)));
  return { x: round(Math.max(0, Math.min(1 - width, value.x))), y: round(Math.max(0, Math.min(1 - height, value.y))), width, height };
}
