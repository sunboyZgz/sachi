import { describe, expect, it } from 'vitest';
import { sceneConfig } from './config';
import { deform, windField } from './wind';
import type { Vec2 } from './types';

describe('shared bookroom wind', () => {
  it('is deterministic, independent of sampling rate and finite for ten minutes', () => {
    for (let sample = 0; sample < 36000; sample++) {
      const value = windField(sample / 60).value;
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThanOrEqual(1.55);
    }
    for (const fps of [30, 60, 120]) expect(windField(fps * 7 / fps)).toEqual(windField(7));
    expect(windField(-3)).toEqual(windField(0));
  });

  for (const plant of sceneConfig.plants) {
    it(`${plant.id} preserves the root while its tips change`, () => {
      const root: Vec2 = [plant.rect[0] + plant.pivot[0] * plant.rect[2], plant.rect[1] + plant.pivot[1] * plant.rect[3]];
      for (let time = 0; time < 30; time += .7) {
        expect(deform(plant.pivot, plant, time, sceneConfig.strength, windField(time))).toEqual(root);
        for (const uv of [[0, 0], [.5, .5], [1, 1]] as const) {
          const point = deform(uv, plant, time, sceneConfig.strength, windField(time));
          expect(point.every(Number.isFinite)).toBe(true);
          const natural: Vec2 = [plant.rect[0] + uv[0] * plant.rect[2], plant.rect[1] + uv[1] * plant.rect[3]];
          expect(Math.hypot(point[0] - natural[0], point[1] - natural[1])).toBeLessThan(110);
          const still = deform(uv, plant, time, 0, windField(time));
          expect(still[0]).toBeCloseTo(natural[0], 7);
          expect(still[1]).toBeCloseTo(natural[1], 7);
        }
      }
      expect(deform([.5, .5], plant, 0, sceneConfig.strength, windField(0))).not.toEqual(deform([.5, .5], plant, 7, sceneConfig.strength, windField(7)));
    });
  }

  it('keeps a nonsingular projection for both plants on every receiver', () => {
    for (const receiver of sceneConfig.receivers) {
      expect(receiver.projections).toHaveLength(sceneConfig.plants.length);
      for (const [a, b, c, d] of receiver.projections) expect(Math.abs(a * d - b * c)).toBeGreaterThan(.01);
    }
  });
});
