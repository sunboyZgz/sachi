import { describe, expect, it } from 'vitest';
import { scheduleTurn, sampleTurn, turnAppearance } from './turn-motion';

describe('volume handoff timeline', () => {
  const schedule = scheduleTurn(7);
  it('takes 1574ms with an overlapping handoff, without sharing a fully open slot', () => {
    expect(schedule.total).toBe(1574);
    expect(schedule.slots[0].inStart).toBeLessThan(schedule.slots[6].outEnd);
    for (const slot of schedule.slots) expect(slot.inStart).toBeGreaterThanOrEqual(slot.outEnd);
  });
  it('starts with the original volume and finishes with only the incoming volume', () => {
    for (const slot of schedule.slots) {
      expect(sampleTurn(0, slot)).toEqual({ oldOpen: 1, newOpen: 0 });
      expect(sampleTurn(schedule.total, slot)).toEqual({ oldOpen: 0, newOpen: 1 });
    }
  });
  it('keeps every material reveal bounded and monotonic across the whole timeline', () => {
    for (const slot of schedule.slots) {
      let old = 1, next = 0;
      for (let time = 0; time <= schedule.total + 20; time += 10) {
        const sample = sampleTurn(time, slot);
        expect(sample.oldOpen).toBeLessThanOrEqual(old);
        expect(sample.newOpen).toBeGreaterThanOrEqual(next);
        expect(sample.oldOpen).toBeGreaterThanOrEqual(0);
        expect(sample.newOpen).toBeLessThanOrEqual(1);
        old = sample.oldOpen; next = sample.newOpen;
      }
    }
  });
  it('supports a short tail without creating phantom works', () => {
    expect(scheduleTurn(3).slots).toHaveLength(3);
    expect(scheduleTurn(3).total).toBeLessThan(schedule.total);
  });
  it('uses a shallow hinge instead of scaling typography or revealing a missing back face', () => {
    for (let open = 0; open <= 1; open += .01) {
      for (const incoming of [false, true]) {
        const album = turnAppearance(open, false, incoming);
        expect(Math.abs(album.angle)).toBeLessThanOrEqual(18);
        expect(album.transform).not.toContain('scale');
        const scroll = turnAppearance(open, true, incoming);
        expect(scroll.angle).toBe(0);
        expect(scroll.clip.startsWith('inset(0 0')).toBe(true);
      }
    }
    expect(turnAppearance(0, false, false).edgeOpacity).toBe(0);
    expect(turnAppearance(1, false, false).edgeOpacity).toBeCloseTo(0);
  });
});
