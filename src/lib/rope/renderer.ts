import { RIG } from './config/rig';
import { smoothPath } from './math';
import type { RopeSimulation } from './physics';
import type { MascotGeometry, Point, RopeConfig, RopeImages } from './types';

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法加载图片: ${url}`));
    image.src = url;
  });
}

/** Map a source triangle to a destination triangle to bend the repeating texture. */
function texturedTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  source: [Point, Point, Point],
  destination: [Point, Point, Point],
) {
  const [s0, s1, s2] = source;
  const [d0, d1, d2] = destination;
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denominator) < 1e-7) return;
  const coefficients = (values: [number, number, number]): [number, number, number] => [
    (values[0] * (s1.y - s2.y) + values[1] * (s2.y - s0.y) + values[2] * (s0.y - s1.y)) / denominator,
    (values[0] * (s2.x - s1.x) + values[1] * (s0.x - s2.x) + values[2] * (s1.x - s0.x)) / denominator,
    (values[0] * (s1.x * s2.y - s2.x * s1.y) + values[1] * (s2.x * s0.y - s0.x * s2.y)
      + values[2] * (s0.x * s1.y - s1.x * s0.y)) / denominator,
  ];
  const [a, c, e] = coefficients([d0.x, d1.x, d2.x]);
  const [b, d, f] = coefficients([d0.y, d1.y, d2.y]);
  const centerX = (d0.x + d1.x + d2.x) / 3;
  const centerY = (d0.y + d1.y + d2.y) / 3;
  // Subpixel overlap prevents hairline seams between triangles at high DPR.
  const expanded = destination.map((point) => {
    const distance = Math.hypot(point.x - centerX, point.y - centerY) || 1;
    return {
      x: point.x + (point.x - centerX) / distance * 0.14,
      y: point.y + (point.y - centerY) / distance * 0.14,
    };
  });
  context.save();
  context.beginPath();
  context.moveTo(expanded[0].x, expanded[0].y);
  context.lineTo(expanded[1].x, expanded[1].y);
  context.lineTo(expanded[2].x, expanded[2].y);
  context.closePath();
  context.clip();
  context.transform(a, b, c, d, e, f);
  context.drawImage(image, 0, 0);
  context.restore();
}

export class CanvasRopeRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly atlas: HTMLCanvasElement;
  private width = 0;
  private height = 0;
  private pixelRatio = 1;
  debug = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly images: RopeImages,
    private readonly options: RopeConfig,
  ) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Canvas 2D 不可用');
    this.context = context;
    // Tile atlas, rather than a stretched full-length image. Never uploaded.
    this.atlas = document.createElement('canvas');
    this.atlas.width = 8192;
    this.atlas.height = images.rope.height;
    const atlasContext = this.atlas.getContext('2d');
    if (!atlasContext) throw new Error('Canvas 2D 不可用');
    for (let x = 0; x < this.atlas.width; x += images.rope.width) {
      atlasContext.drawImage(images.rope, x, 0);
    }
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = Math.min(pixelRatio, this.options.pixelRatioCap);
    this.canvas.width = Math.ceil(width * this.pixelRatio);
    this.canvas.height = Math.ceil(height * this.pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  mascotGeometry(endpoint: Point, angle: number): MascotGeometry {
    const scale = this.options.mascotWidth / RIG.mascot.sourceSize[0];
    const [attachX, attachY] = RIG.mascot.attachmentPx;
    return {
      x: endpoint.x, y: endpoint.y, angle,
      width: RIG.mascot.sourceSize[0] * scale,
      height: RIG.mascot.sourceSize[1] * scale,
      attachX: attachX * scale, attachY: attachY * scale, scale,
    };
  }

  draw(simulation: RopeSimulation): MascotGeometry {
    const context = this.context;
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    const points = smoothPath(simulation.nodes, 3);
    const width = this.options.ropeWidth;
    const arcLengths = [0];
    for (let i = 1; i < points.length; i += 1) {
      arcLengths[i] = arcLengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    const total = arcLengths[arcLengths.length - 1];
    const textureScale = width / this.images.rope.height;
    // Anchor material phase at the pendant; payout reveals texture at the top.
    const phase = (this.images.rope.width - (total / textureScale) % this.images.rope.width) % this.images.rope.width;
    const edges = points.map((point, index) => {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const distance = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
      const normalX = -(next.y - previous.y) / distance;
      const normalY = (next.x - previous.x) / distance;
      return {
        a: { x: point.x + normalX * width / 2, y: point.y + normalY * width / 2 },
        b: { x: point.x - normalX * width / 2, y: point.y - normalY * width / 2 },
        u: phase + arcLengths[index] / textureScale,
      };
    });
    // A thin core masks subpixel cracks without replacing the texture.
    context.strokeStyle = '#717a56';
    context.lineWidth = width * 0.65;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    points.forEach((point, index) => {
      if (index) context.lineTo(point.x, point.y);
      else context.moveTo(point.x, point.y);
    });
    context.stroke();
    for (let i = 0; i < edges.length - 1; i += 1) {
      const start = edges[i];
      const end = edges[i + 1];
      const height = this.images.rope.height;
      if (end.u > this.atlas.width) continue;
      texturedTriangle(context, this.atlas,
        [{ x: start.u, y: 0 }, { x: start.u, y: height }, { x: end.u, y: 0 }],
        [start.a, start.b, end.a]);
      texturedTriangle(context, this.atlas,
        [{ x: start.u, y: height }, { x: end.u, y: height }, { x: end.u, y: 0 }],
        [start.b, end.b, end.a]);
    }
    const geometry = this.mascotGeometry(simulation.endpoint, simulation.angle);
    context.save();
    context.translate(geometry.x, geometry.y);
    context.rotate(geometry.angle);
    context.shadowColor = 'rgba(52,58,52,.11)';
    context.shadowBlur = 3;
    context.shadowOffsetX = 1;
    context.shadowOffsetY = 2;
    context.drawImage(this.images.mascot, -geometry.attachX, -geometry.attachY, geometry.width, geometry.height);
    context.shadowColor = 'transparent';
    if (this.options.showKnot) {
      const knotWidth = RIG.knot.width * this.options.mascotWidth / 54;
      const knotHeight = knotWidth * this.images.knot.height / this.images.knot.width;
      context.drawImage(this.images.knot, -knotWidth / 2, -knotHeight + RIG.knot.bottomOffset, knotWidth, knotHeight);
    }
    context.restore();
    if (this.debug) {
      context.fillStyle = '#935444';
      for (const point of simulation.nodes) {
        context.beginPath();
        context.arc(point.x, point.y, 1.8, 0, Math.PI * 2);
        context.fill();
      }
      context.strokeStyle = '#935444';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(geometry.x, geometry.y, 4, 0, Math.PI * 2);
      context.stroke();
    }
    return geometry;
  }

  destroy(): void {
    this.canvas.width = 0;
    this.atlas.width = 0;
  }
}
