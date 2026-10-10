import type { Contour } from './flow-geometry';

/** Same alpha envelopes for Sharp during publishing and Canvas in editor previews. */
export function contourFromPixels(pixels: ArrayLike<number>, width: number, height: number, channels = 4): Contour {
  const rows: Contour['rows'] = [];
  for (let y = 0; y < height; y += 1) {
    let left = width;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * channels + channels - 1] >= 8) {
        left = Math.min(left, x);
        right = x;
      }
    }
    rows.push(right < 0 ? null : [left / width, (right + 1) / width]);
  }
  if (!rows.some(Boolean)) throw new Error('环绕图片完全透明，无法生成轮廓。');
  return { height, rows };
}
