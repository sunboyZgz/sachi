import { describe, expect, it } from 'vitest';
import { clipHalfPlane, peelGeometry } from './geometry';

const area = (points: { x: number; y: number }[]) => Math.abs(points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0)) / 2;

describe('corner peel geometry', () => {
  it('retains the entire page at rest and none when complete', () => {
    expect(area(peelGeometry(0, 1440, 900).polygon)).toBe(1440 * 900);
    expect(peelGeometry(1, 1440, 900).polygon).toEqual([]);
    expect(peelGeometry(-1, 1440, 900).progress).toBe(0);
    expect(peelGeometry(2, 1440, 900).progress).toBe(1);
  });

  it('opens the upper right first, leaving the lower left on the flat page', () => {
    const { axis, crease } = peelGeometry(.18, 1440, 900);
    expect(1440 * axis.x).toBeGreaterThan(crease);
    expect(900 * axis.y).toBeLessThan(crease);
  });

  it('exposes more of the backdrop throughout a forward pull', () => {
    let previous = 1440 * 900;
    for (let index = 0; index <= 100; index++) {
      const current = area(peelGeometry(index / 100, 1440, 900).polygon);
      expect(current).toBeLessThanOrEqual(previous + .001);
      previous = current;
    }
  });

  it('clips each vertex inside the viewport and the same crease used by the shader', () => {
    for (const [width, height] of [[1440, 900], [1024, 768], [1920, 1080]]) {
      for (const progress of [.18, 1 / 3, 2 / 3, .9]) {
        const { axis, crease, polygon } = peelGeometry(progress, width, height, .6);
        for (const point of polygon) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(width);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(height);
          expect(point.x * axis.x + point.y * axis.y).toBeLessThanOrEqual(crease + .001);
        }
      }
    }
  });

  it('scales the handoff geometry uniformly with the viewport', () => {
    const original = peelGeometry(.4, 1440, 900);
    const scaled = peelGeometry(.4, 1152, 720);
    expect(scaled.radius).toBeCloseTo(original.radius * .8);
    expect(scaled.crease).toBeCloseTo(original.crease * .8);
    expect(area(scaled.polygon)).toBeCloseTo(area(original.polygon) * .64);
  });

  it('handles axis-aligned and empty half-plane intersections', () => {
    expect(area(clipHalfPlane(100, 80, { x: 1, y: 0 }, 40))).toBe(3200);
    expect(clipHalfPlane(100, 80, { x: 0, y: 1 }, -1)).toEqual([]);
    expect(area(clipHalfPlane(100, 80, { x: 0, y: 1 }, 100))).toBe(8000);
  });
});
