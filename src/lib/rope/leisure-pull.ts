import type { RopePullSettings } from './types';

const desktop: Readonly<RopePullSettings> = Object.freeze({
  maxPayout: 240,
  triggerDistance: 160,
  triggerHysteresis: 24,
  maxDragPayoutSpeed: 360,
});

const compact: Readonly<RopePullSettings> = Object.freeze({
  maxPayout: 176,
  triggerDistance: 112,
  triggerHysteresis: 16,
  maxDragPayoutSpeed: 252,
});

/** Longer travel with about 0.45s of physical opening even after a fast pull. */
export function leisurePullSettings(viewportWidth: number): Readonly<RopePullSettings> {
  return viewportWidth >= 901 ? desktop : compact;
}
