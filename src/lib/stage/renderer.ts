import { deform, windField } from './wind';
import type { Plant, Receiver, Rect, SceneConfig, SceneImages, Vec2, Wind } from './types';

function context(canvas: HTMLCanvasElement, opaque = false): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha: !opaque });
  if (!ctx) throw new Error('书斋 Canvas2D 不可用');
  return ctx;
}

function buffer(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return { canvas, ctx: context(canvas) };
}

type Triangle = readonly [Vec2, Vec2, Vec2];
type PlantBuffer = ReturnType<typeof buffer> & { plant: Plant; rect: Rect };

/** Affine texture triangle; slightly expanded clips avoid cracks in translucent leaves. */
function triangle(ctx: CanvasRenderingContext2D, image: HTMLImageElement, source: Triangle, dest: Triangle) {
  const [a, b, c] = source, [p, q, r] = dest;
  const determinant = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(determinant) < 1e-6) return;
  const A = ((q[0] - p[0]) * (c[1] - a[1]) - (r[0] - p[0]) * (b[1] - a[1])) / determinant;
  const C = ((r[0] - p[0]) * (b[0] - a[0]) - (q[0] - p[0]) * (c[0] - a[0])) / determinant;
  const B = ((q[1] - p[1]) * (c[1] - a[1]) - (r[1] - p[1]) * (b[1] - a[1])) / determinant;
  const D = ((r[1] - p[1]) * (b[0] - a[0]) - (q[1] - p[1]) * (c[0] - a[0])) / determinant;
  const mx = (p[0] + q[0] + r[0]) / 3, my = (p[1] + q[1] + r[1]) / 3;
  ctx.save();
  ctx.beginPath();
  dest.forEach((point, index) => {
    const dx = point[0] - mx, dy = point[1] - my, length = Math.hypot(dx, dy) || 1;
    const x = point[0] + dx / length * .22, y = point[1] + dy / length * .22;
    if (index) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.transform(A, B, C, D, p[0] - A * a[0] - C * a[1], p[1] - B * a[0] - D * a[1]);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

/** The exact deformed raster is used by all three shadows and the visible foliage. */
export class SceneRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly shadow = buffer(1, 1);
  private readonly soft = buffer(1, 1);
  private readonly supportsBlur = typeof this.soft.ctx.filter === 'string';
  private nodes: PlantBuffer[] = [];
  private scale = 1;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly images: SceneImages, private readonly config: SceneConfig) {
    this.ctx = context(canvas, true);
  }

  resize(width: number) {
    const [sceneWidth, sceneHeight] = this.config.size;
    this.canvas.width = width;
    this.canvas.height = Math.round(width * sceneHeight / sceneWidth);
    this.scale = width / sceneWidth;
    for (const target of [this.shadow.canvas, this.soft.canvas]) {
      target.width = Math.max(1, Math.round(width * this.config.shadowScale));
      target.height = Math.max(1, Math.round(this.canvas.height * this.config.shadowScale));
    }
    for (const node of this.nodes) node.canvas.width = node.canvas.height = 0;
    this.nodes = this.config.plants.map((plant) => {
      const [x, y, w, h] = plant.rect, padding = 45;
      return { plant, rect: [x - padding, y - padding, w + padding * 2, h + padding * 2], ...buffer((w + padding * 2) * this.scale, (h + padding * 2) * this.scale) };
    });
  }

  private plantFrame(time: number, wind: Wind) {
    for (const { ctx, canvas, plant, rect } of this.nodes) {
      const image = this.images[plant.id], nx = 10, ny = 8;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(this.scale, 0, 0, this.scale, -rect[0] * this.scale, -rect[1] * this.scale);
      ctx.imageSmoothingEnabled = true;
      const points: Vec2[] = [], uvs: Vec2[] = [];
      for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
        const uv: Vec2 = [x / nx, y / ny];
        uvs.push([uv[0] * image.naturalWidth, uv[1] * image.naturalHeight]);
        points.push(deform(uv, plant, time, this.config.strength, wind));
      }
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const a = y * (nx + 1) + x, b = a + 1, c = a + nx + 1, d = c + 1;
        triangle(ctx, image, [uvs[a], uvs[b], uvs[c]], [points[a], points[b], points[c]]);
        triangle(ctx, image, [uvs[c], uvs[b], uvs[d]], [points[c], points[b], points[d]]);
      }
    }
  }

  private cast(receiver: Receiver) {
    const [width, height] = this.config.size, q = this.shadow.canvas.width / width;
    const ctx = this.shadow.ctx, soft = this.soft.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.shadow.canvas.width, this.shadow.canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    this.nodes.forEach((node, index) => {
      const [a, b, c, d, e, f] = receiver.projections[index];
      ctx.setTransform(q * a, q * b, q * c, q * d, q * e, q * f);
      ctx.drawImage(node.canvas, ...node.rect);
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#2b3225';
    ctx.fillRect(0, 0, this.shadow.canvas.width, this.shadow.canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    soft.clearRect(0, 0, this.soft.canvas.width, this.soft.canvas.height);
    if (this.supportsBlur) {
      soft.filter = `blur(${receiver.blur * q}px)`;
      soft.drawImage(this.shadow.canvas, 0, 0);
      soft.filter = 'none';
    } else {
      const weights = [1, 2, 1], radius = receiver.blur * q * .85;
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
        soft.globalAlpha = weights[x + 1] * weights[y + 1] / 16;
        soft.drawImage(this.shadow.canvas, x * radius, y * radius);
      }
      soft.globalAlpha = 1;
    }
    soft.globalCompositeOperation = 'destination-in';
    soft.drawImage(this.images[receiver.id], 0, 0, this.soft.canvas.width, this.soft.canvas.height);
    soft.globalCompositeOperation = 'source-over';
    this.ctx.globalAlpha = receiver.opacity;
    this.ctx.drawImage(this.soft.canvas, 0, 0, width, height);
    this.ctx.globalAlpha = 1;
  }

  render(time: number) {
    const [width, height] = this.config.size;
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.images.room, 0, 0, width, height);
    this.plantFrame(time, windField(time));
    for (const receiver of this.config.receivers) this.cast(receiver);
    for (const node of this.nodes) this.ctx.drawImage(node.canvas, ...node.rect);
  }

  destroy() {
    for (const node of this.nodes) node.canvas.width = node.canvas.height = 0;
    this.nodes = [];
    this.shadow.canvas.width = this.shadow.canvas.height = 0;
    this.soft.canvas.width = this.soft.canvas.height = 0;
    this.canvas.width = this.canvas.height = 0;
  }
}
