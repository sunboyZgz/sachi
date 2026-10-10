/** Lower background resolution only after sustained slow submissions. */
export function nextRenderBudget(current: number, renderedWidth: number, averageMs: number, samples: number): number {
  if (samples < 15 || averageMs <= 20 || renderedWidth <= 900) return current;
  return Math.min(current, renderedWidth > 1100 ? 1100 : 900);
}
