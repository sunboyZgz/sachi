import type { Point } from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function length2(x: number, y: number): number {
  return Math.hypot(x, y);
}

// A finite-mass, damped, second-order scalar. Frequencies are radians/second.
export function springStep(
  value: number,
  velocity: number,
  target: number,
  frequency: number,
  dampingRatio: number,
  dt: number,
): [number, number] {
  velocity += ((target - value) * frequency * frequency - 2 * dampingRatio * frequency * velocity) * dt;
  value += velocity * dt;
  return [value, velocity];
}

export function smoothPath(nodes: readonly Point[], subdivisions = 3): Point[] {
  const points: Point[] = [{ x: nodes[0].x, y: nodes[0].y }];
  // Quadratic corner rounding stays inside the control polygon, avoiding loops.
  for (let i = 1; i < nodes.length - 1; i += 1) {
    const point = nodes[i];
    const previous = nodes[i - 1];
    const next = nodes[i + 1];
    const start = { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 };
    const end = { x: (next.x + point.x) / 2, y: (next.y + point.y) / 2 };
    if (i === 1) points.push(start);
    for (let step = 1; step <= subdivisions; step += 1) {
      const t = step / subdivisions;
      const u = 1 - t;
      points.push({
        x: u * u * start.x + 2 * u * t * point.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * point.y + t * t * end.y,
      });
    }
  }
  points.push({ ...nodes[nodes.length - 1] });
  return points;
}
