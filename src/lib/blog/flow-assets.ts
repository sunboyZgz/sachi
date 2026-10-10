import sharp from 'sharp';
import type { Contour } from '../flow-geometry';
import { BlogError } from './files';
import { contourFromPixels } from '../image-contour';

export async function imageDimensions(bytes: Buffer, flow = false) {
  const info = await sharp(bytes, { animated: true, limitInputPixels: 80_000_000 }).metadata();
  const height = info.pageHeight ?? info.height;
  if (!info.width || !height) throw new BlogError('图片缺少有效尺寸。');
  if (flow && (info.pages ?? 1) > 1) throw new BlogError('环绕图片必须是静态图片，请先导出一帧。');
  if (flow && info.orientation && info.orientation !== 1) throw new BlogError('环绕图包含 EXIF 旋转，请先显式修正图片方向。');
  if (!flow && (info.pages ?? 1) === 1 && info.autoOrient) return { width: info.autoOrient.width, height: info.autoOrient.height };
  return { width: info.width, height };
}

/** Conservative row envelopes, generated from the same canvas as the image.
 * Downsampling bounds CPU/JSON size without cropping transparent margins.
 * Opaque images naturally become rectangular obstacles. */
export async function createImageContour(bytes: Buffer): Promise<Contour> {
  await imageDimensions(bytes, true);
  const { data, info } = await sharp(bytes, { limitInputPixels: 80_000_000 })
    .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  try { return contourFromPixels(data, info.width, info.height, info.channels); }
  catch (error) { throw new BlogError(error instanceof Error ? error.message : String(error)); }
}
