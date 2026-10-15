import type { ImageWindow } from './image-window';

export type Interval = { x: number; width: number };
export type Position = { x: number; y: number };
export type Obstacle = Position & { width: number; height: number };
export type Contour = { height: number; rows: Array<[number, number] | null> };
export const maxFlowY = 330;

export function isContour(value: unknown): value is Contour {
  if (!value || typeof value !== 'object') return false;
  const { height, rows } = value as Partial<Contour>;
  return Number.isInteger(height) && !!height && height > 0 && height <= 8192 && Array.isArray(rows) && rows.length === height
    && rows.some((row) => row !== null)
    && rows.every((row) => row === null || (Array.isArray(row) && row.length === 2 && row.every((v) => typeof v === 'number' && Number.isFinite(v)) && row[0] >= 0 && row[1] <= 1 && row[0] <= row[1]));
}

export function flowImageSize(width = 205, sourceWidth?: number, sourceHeight?: number, containerWidth = Infinity) {
  if (!sourceWidth || !sourceHeight || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) throw new Error('环绕图片缺少有效的原始尺寸。');
  const scale = Math.min(width, containerWidth) / sourceWidth;
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}

/** Project the original alpha outline into the selected viewport, without new media files. */
export function windowContour(contour: Contour, window?: ImageWindow): Contour {
  if (!window) return contour;
  const height = Math.max(1, Math.round(contour.height * window.height));
  return { height, rows: Array.from({ length: height }, (_, index) => {
    const row = contour.rows[Math.min(contour.height - 1, Math.floor((window.y + index / height * window.height) * contour.height))];
    if (!row) return null;
    const left = Math.max(row[0], window.x), right = Math.min(row[1], window.x + window.width);
    return left > right ? null : [Math.max(0, (left - window.x) / window.width), Math.min(1, (right - window.x) / window.width)];
  }) };
}

export function availableIntervals(
  width: number,
  y: number,
  lineHeight: number,
  obstacle: Obstacle,
  contour: Contour,
  gap = 16,
  minWidth = 94,
): Interval[] {
  const top = Math.floor(((y - obstacle.y - gap) / obstacle.height) * contour.height);
  const bottom = Math.ceil(((y + lineHeight - obstacle.y + gap) / obstacle.height) * contour.height);
  if (bottom < 0 || top >= contour.height) return [{ x: 0, width }];

  let left = Infinity;
  let right = -Infinity;
  for (let row = Math.max(0, top); row <= Math.min(contour.height - 1, bottom); row += 1) {
    const band = contour.rows[row];
    if (!band) continue;
    left = Math.min(left, band[0]);
    right = Math.max(right, band[1]);
  }
  if (!Number.isFinite(left)) return [{ x: 0, width }];

  const cutLeft = Math.max(0, obstacle.x + left * obstacle.width - gap);
  const cutRight = Math.min(width, obstacle.x + right * obstacle.width + gap);
  return [
    { x: 0, width: cutLeft },
    { x: cutRight, width: width - cutRight },
  ].filter((region) => region.width >= minWidth);
}

export function clampPosition(position: Position, width: number, imageWidth: number, maxY = maxFlowY) {
  return {
    x: Math.max(0, Math.min(width - imageWidth, position.x)),
    y: Math.max(0, Math.min(maxY, position.y)),
  };
}
