import { describe, expect, it } from 'vitest';
import { leisurePullSettings } from './leisure-pull';
import { RopeSimulation } from './physics';
import { updateReveal } from './reveal-state';

const idle = { phase: 'idle', progress: 0 } as const;
const input = (extraPull: number) => ({ phase: 'dragging', dragging: true, extraPull, reducedMotion: false } as const);

describe('longer leisure pull', () => {
  it('uses the same desktop boundary as the reveal renderer', () => {
    expect(leisurePullSettings(900).triggerDistance).toBe(112);
    expect(leisurePullSettings(901).triggerDistance).toBe(160);
  });

  for (const [name, width, restLength] of [['desktop', 1440, 146], ['compact', 390, 112]] as const) {
    const settings = leisurePullSettings(width);

    it(`${name} keeps progress proportional to actual travel and immediately reverses`, () => {
      const half = updateReveal(idle, input(settings.triggerDistance * .53), settings.triggerDistance);
      expect(half.progress).toBeCloseTo(.53);
      expect(updateReveal(half, input(settings.triggerDistance * .31), settings.triggerDistance).progress).toBeCloseTo(.31);
      expect(updateReveal(idle, input(42), settings.triggerDistance).progress).toBeLessThan(.4);
    });

    it.each([30, 60, 120, 144])(`${name} gives a fast pull visible travel at %i Hz without stretching`, (hz) => {
      const simulation = new RopeSimulation({ ...settings, restLength });
      simulation.beginDrag(0, restLength + 1000);
      let reachedAt = 0;
      for (let frame = 0; frame < Math.ceil(hz); frame++) {
        const previousPayout = simulation.payout;
        const previousTime = simulation.elapsed;
        simulation.advance(1 / hz);
        expect(simulation.payout - previousPayout).toBeLessThanOrEqual(settings.maxDragPayoutSpeed * (simulation.elapsed - previousTime) + 1e-7);
        if (!reachedAt && simulation.extraPull >= settings.triggerDistance) reachedAt = simulation.elapsed;
      }
      expect(reachedAt).toBeGreaterThan(.4);
      expect(reachedAt).toBeLessThan(.65);
      expect(simulation.payout).toBeLessThanOrEqual(settings.maxPayout);
      expect(simulation.maxObservedStrain).toBeLessThan(.032);
    });

    it(`${name} shortens immediately, then releases and settles normally`, () => {
      const simulation = new RopeSimulation({ ...settings, restLength });
      simulation.beginDrag(0, restLength + 1000);
      for (let step = 0; step < 120; step++) simulation.advance(1 / 120);
      const opened = simulation.extraPull;
      simulation.moveDrag(0, restLength + 20);
      simulation.advance(1 / 120);
      expect(simulation.extraPull).toBeLessThan(opened / 4);
      simulation.endDrag();
      for (let step = 0; step < 420; step++) simulation.advance(1 / 120);
      expect(simulation.settled()).toBe(true);
      expect(Math.abs(simulation.endpoint.y - restLength)).toBeLessThan(1);
    });
  }
});
