import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createImageContour, imageDimensions } from './flow-assets';

describe('generic flow asset preparation', () => {
  it('generates a deterministic alpha contour without trimming or changing aspect ratio', async () => {
    const bytes = await sharp({ create: { width: 120, height: 60, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: Buffer.from('<svg width="120" height="60"><rect x="30" y="10" width="60" height="40" fill="green"/></svg>') }]).png().toBuffer();
    expect(await imageDimensions(bytes, true)).toEqual({ width: 120, height: 60 });
    const contour = await createImageContour(bytes);
    expect(contour.rows[0]).toBeNull();
    expect(contour.rows[20]).toEqual([0.25, 0.75]);
    expect(await createImageContour(bytes)).toEqual(contour);
  });
  it('uses rectangular envelopes for opaque images and rejects invisible images', async () => {
    const opaque = await sharp({ create: { width: 12, height: 6, channels: 3, background: 'green' } }).png().toBuffer();
    expect((await createImageContour(opaque)).rows).toEqual(Array(6).fill([0, 1]));
    const transparent = await sharp({ create: { width: 12, height: 6, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await expect(createImageContour(transparent)).rejects.toThrow('完全透明');
  });
  it('bounds generated JSON for large image canvases', async () => {
    const bytes = await sharp({ create: { width: 1000, height: 2000, channels: 3, background: 'green' } }).png().toBuffer();
    expect((await createImageContour(bytes)).height).toBeLessThanOrEqual(256);
  });
});
