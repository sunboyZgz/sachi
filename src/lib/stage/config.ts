import type { SceneConfig } from './types';

/** Calibrated for the supplied 1586×992 room; all layers share these coordinates. */
export const sceneConfig: SceneConfig = {
  size: [1586, 992], strength: 1.4, targetFps: 30,
  maxWidth: 1440, dprCap: 1.5, shadowScale: .5,
  plants: [
    { id: 'bamboo', rect: [-35, -40, 540, 405], pivot: [.045, .15], gain: 1, phase: .1 },
    { id: 'pine-plum', rect: [1076, -32, 570, 427.5], pivot: [.98, .22], gain: .65, phase: 1.7 },
  ],
  receivers: [
    { id: 'wall', opacity: .16, blur: 5.5, projections: [[1.5, .35, .48, 1.1, 450, 95], [1.4, -.12, -.15, 1.12, -760, 120]] },
    { id: 'floor', opacity: .12, blur: 4.5, projections: [[1.7, .07, .5, .37, 180, 682], [1.45, -.03, -.3, .35, -800, 728]] },
    { id: 'desk', opacity: .13, blur: 2.3, projections: [[1.6, .01, .4, .22, 60, 832], [.8, .03, .1, .2, -380, 822]] },
  ],
};
