import type { Point } from '@/lib/rope/types';

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

/** The handoff's cylinder path, in actual viewport coordinates. */
export function peelGeometry(progress: number, width: number, height: number, side = 0) {
  const p = clamp(progress);
  const angle = -.86 + .22 * p * p * (3 - 2 * p) + clamp(side, -1, 1) * .035 * Math.sin(Math.PI * p);
  const axis = { x: Math.cos(angle), y: Math.sin(angle) };
  const corners = [0, width * axis.x, width * axis.x + height * axis.y, height * axis.y];
  const scale = Math.min(width / 1440, height / 900);
  const radius = (16 + 65 * Math.pow(Math.sin(Math.PI * p), .82)) * scale;
  const crease = Math.max(...corners) - (Math.max(...corners) - Math.min(...corners) + 2 * radius + 20 * scale) * Math.pow(p, 1.13);
  const polygon = clipHalfPlane(width, height, axis, crease);
  // Cover the shader's shallow-lift tolerance plus browser clip antialiasing.
  // This overlap stays under the cylinder; its crease and path remain exact.
  const contactOverlap = Math.sqrt(2 * radius * .02) + 1;
  const domPolygon = polygon.length ? clipHalfPlane(width, height, axis, crease + contactOverlap) : [];
  const clip = domPolygon.length ? `polygon(${domPolygon.map(({ x, y }) => `${x}px ${y}px`).join(', ')})` : 'polygon(0 0, 0 0, 0 0)';
  return { progress: p, angle, axis, radius, crease, polygon, clip };
}

/** Preserve the original DOM on the flat side of exactly the shader's crease. */
export function clipHalfPlane(width: number, height: number, axis: Point, crease: number): Point[] {
  const rectangle = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const polygon: Point[] = [];
  for (let index = 0; index < rectangle.length; index++) {
    const a = rectangle[index];
    const b = rectangle[(index + 1) % rectangle.length];
    const da = a.x * axis.x + a.y * axis.y - crease;
    const db = b.x * axis.x + b.y * axis.y - crease;
    if (da <= 0) polygon.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const fraction = da / (da - db);
      polygon.push({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
    }
  }
  return polygon;
}
