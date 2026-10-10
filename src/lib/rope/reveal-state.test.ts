import { describe, expect, it } from 'vitest';
import { revealGeometry, updateReveal, type RevealInput, type RevealState } from './reveal-state';

const idle: RevealState = { phase: 'idle', progress: 0 };
const dragging = (extraPull: number): RevealInput => ({ phase: 'dragging', extraPull, dragging: true, reducedMotion: false });

describe('rope-driven paper reveal', () => {
  it('can hold an intermediate position and reverse without restarting an animation', () => {
    const half = updateReveal(idle, dragging(42 * 0.53));
    expect(half.progress).toBeCloseTo(0.53);
    expect(updateReveal(half, dragging(42 * 0.53))).toEqual(half);
    expect(updateReveal(half, dragging(42 * 0.31)).progress).toBeCloseTo(0.31);
  });

  it('uses actual downward displacement instead of paid-out rope length', () => {
    const sideways = { ...dragging(-5), payout: 64 };
    expect(updateReveal(idle, sideways).progress).toBe(0);
    expect(updateReveal(idle, dragging(100)).progress).toBe(1);
  });

  it('allows a fully revealed preview to be withdrawn before confirmation', () => {
    const full = updateReveal(idle, { ...dragging(48), phase: 'armed' });
    expect(full).toEqual({ phase: 'dragging', progress: 1 });
    expect(updateReveal(full, dragging(20)).progress).toBeCloseTo(20 / 42);
  });

  it('keeps the falling paper monotonic when the pendant oscillates', () => {
    let state = updateReveal(idle, dragging(30));
    const positions = [28, 31, 12, 14, 0.5].map((extraPull) => {
      state = updateReveal(state, { phase: 'returning', extraPull, dragging: false, reducedMotion: false });
      return state.progress;
    });
    expect(positions.every((progress, index) => index === 0 || progress <= positions[index - 1])).toBe(true);
    expect(updateReveal(state, { phase: 'idle', extraPull: 0.5, dragging: false, reducedMotion: false })).toEqual(idle);
  });

  it('locks completion while the rope returns and while the return button closes it', () => {
    for (const phase of ['committed', 'closing'] as const) {
      const state = { phase, progress: phase === 'committed' ? 1 : 0.4 };
      expect(updateReveal(state, { phase: 'idle', extraPull: 0, dragging: false, reducedMotion: false })).toEqual(state);
    }
  });

  it('does not move the page during a reduced-motion drag', () => {
    expect(updateReveal(idle, { ...dragging(60), reducedMotion: true }).progress).toBe(0);
  });

  it('starts flush, lifts halfway at half progress and clears the whole viewport', () => {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      expect(revealGeometry(0, width, height).lift).toBe(0);
      expect(revealGeometry(0.5, width, height).lift).toBe(height / 2);
      expect(revealGeometry(1, width, height).lift).toBe(height);
      expect(revealGeometry(0, width, height).shadowOpacity).toBe(0);
    }
  });
});
