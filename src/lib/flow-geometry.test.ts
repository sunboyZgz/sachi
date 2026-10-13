import { describe, expect, it } from 'vitest';
import contour from '../../public/assets/tea-cup-contour.json';
import { availableIntervals, clampPosition, flowImageSize, isContour, type Contour } from './flow-geometry';

describe('flow geometry', () => {
  it('keeps full-width rows above the obstacle and splits intersecting rows', () => {
    const obstacle = { x: 240, y: 80, width: 205, height: 203 };
    expect(availableIntervals(720, 0, 36, obstacle, contour as Contour)).toEqual([{ x: 0, width: 720 }]);
    const split = availableIntervals(720, 150, 36, obstacle, contour as Contour);
    expect(split).toHaveLength(2);
    expect(split[0].width).toBeLessThan(275);
    expect(split[1].x).toBeGreaterThan(390);
  });

  it('clamps the draggable image to the supported area', () => {
    expect(clampPosition({ x: -20, y: 900 }, 720, 205)).toEqual({ x: 0, y: 330 });
  });

  it('preserves arbitrary aspect ratios and the original tea image baseline', () => {
    expect(flowImageSize(undefined, 205, 203)).toEqual({ width: 205, height: 203 });
    expect(flowImageSize(240, 1200, 600)).toEqual({ width: 240, height: 120 });
    expect(flowImageSize(240, 400, 2000)).toEqual({ width: 240, height: 1200 });
    for (const width of [120, 180, 240, 360]) {
      expect(flowImageSize(width, 100, 500)).toEqual({ width, height: width * 5 });
      expect(flowImageSize(width, 100, 500, 90)).toEqual({ width: 90, height: 450 });
    }
    expect(() => flowImageSize(240, 0, 0)).toThrow('原始尺寸');
  });

  it('rejects broken, empty, excessive or non-normalized contour data', () => {
    expect(isContour(contour)).toBe(true);
    for (const value of [null, {}, { height: 1, rows: [null] }, { height: 2, rows: [[0, 1]] }, { height: 1, rows: [[0.9, 0.1]] }, { height: 1, rows: [[0, Infinity]] }, { height: 8193, rows: Array(8193).fill([0, 1]) }]) expect(isContour(value)).toBe(false);
  });
});
