import type { Plant, Vec2, Wind } from './types';

/** One deterministic forcing field for both visible foliage and its receivers. */
export function windField(time: number): Wind {
  const t = Math.max(0, time);
  const envelope = .24 + .76 * (.5 + .5 * Math.sin(t * .41 - .7)) ** 2;
  const wave = .72 * Math.sin(t * .79) + .23 * Math.sin(t * 1.37 + .6) + .13 * Math.sin(t * 2.13 + 1.4);
  return { value: Math.max(-1.55, Math.min(1.55, envelope * wave)), envelope };
}

export function deform(uv: Vec2, plant: Plant, time: number, strength: number, wind: Wind): Vec2 {
  const [x, y, width, height] = plant.rect;
  const root: Vec2 = [x + plant.pivot[0] * width, y + plant.pivot[1] * height];
  const dx = x + uv[0] * width - root[0], dy = y + uv[1] * height - root[1];
  const radius = Math.min(1, Math.hypot(dx, dy) / (width * .87));
  const weight = radius * radius * (3 - 2 * radius);
  const angle = (wind.value * .055 + Math.sin(time * .83 + plant.phase) * .009) * strength * plant.gain * weight;
  const flutter = strength * plant.gain * (.5 + .5 * Math.abs(wind.value));
  const c = Math.cos(angle), s = Math.sin(angle);
  return [
    root[0] + c * dx - s * dy + Math.sin(time * 2.23 + uv[0] * 7 + uv[1] * 5 + plant.phase) * 1.8 * flutter * weight * weight,
    root[1] + s * dx + c * dy + Math.sin(time * 1.81 + uv[0] * 5 - uv[1] * 4 + plant.phase) * 1.4 * flutter * weight * weight,
  ];
}
