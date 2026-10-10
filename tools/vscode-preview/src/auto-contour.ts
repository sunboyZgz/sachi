import { contourFromPixels } from '../../../src/lib/image-contour';

const cache = new Map<string, string>();

export async function automaticContour(url: string) {
  const cached = cache.get(url);
  if (cached) return cached;
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(1, 256 / image.naturalWidth, 256 / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法读取环绕图片的透明轮廓。');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const contour = contourFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  const value = `data:application/json;base64,${btoa(JSON.stringify(contour))}`;
  if (cache.size >= 12) cache.delete(cache.keys().next().value!);
  cache.set(url, value);
  return value;
}
