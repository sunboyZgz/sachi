import { describe, expect, it } from 'vitest';
import { nextRenderBudget } from './budget';

describe('ambient rendering budget', () => {
  it('ignores warm-up spikes and fast rendering', () => {
    expect(nextRenderBudget(1440, 1440, 50, 5)).toBe(1440);
    expect(nextRenderBudget(1440, 1440, 2, 60)).toBe(1440);
  });

  it('reduces slow desktop rendering in two bounded steps', () => {
    expect(nextRenderBudget(1440, 1439, 40, 15)).toBe(1100);
    expect(nextRenderBudget(1100, 1100, 30, 15)).toBe(900);
    expect(nextRenderBudget(900, 900, 30, 15)).toBe(900);
  });

  it('does not resize a small mobile canvas or raise an existing cap', () => {
    expect(nextRenderBudget(1440, 585, 25, 15)).toBe(1440);
    expect(nextRenderBudget(900, 1440, 25, 15)).toBe(900);
  });
});
