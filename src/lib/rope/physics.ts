import { DEFAULTS } from './config/defaults';
import { clamp, length2, springStep } from './math';
import type { Point, RopeNode, RopePhysicsConfig, SimulationOptions, SimulationSnapshot } from './types';

/** A small XPBD distance chain with finite spool travel, in CSS pixels and seconds. */
export class RopeSimulation {
  readonly options: RopePhysicsConfig;
  anchor: Point;
  nodes: RopeNode[] = [];
  payout = 0;
  angle = 0;
  dragging = false;
  elapsed = 0;
  maxObservedStrain = 0;
  private payoutVelocity = 0;
  private angleVelocity = 0;
  private accumulator = 0;
  private target: Point | null = null;

  constructor(options: SimulationOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
    if (!Number.isInteger(this.options.segments) || this.options.segments < 4 || this.options.segments > 64) {
      throw new RangeError('segments must be 4..64');
    }
    for (const key of ['restLength', 'fixedDt', 'gravity', 'iterations', 'maxPayout'] as const) {
      if (!Number.isFinite(this.options[key]) || this.options[key] <= 0) {
        throw new RangeError(`${key} must be positive`);
      }
    }
    if (!Number.isFinite(this.options.maxDragPayoutSpeed) || this.options.maxDragPayoutSpeed < 0) {
      throw new RangeError('maxDragPayoutSpeed must be non-negative');
    }
    this.anchor = { x: options.anchorX ?? 0, y: options.anchorY ?? 0 };
    this.reset();
  }

  reset(): void {
    const segments = this.options.segments;
    this.nodes = Array.from({ length: segments + 1 }, (_, index) => ({
      x: this.anchor.x,
      y: this.anchor.y + this.options.restLength * index / segments,
      vx: 0,
      vy: 0,
    }));
    this.payout = 0;
    this.payoutVelocity = 0;
    this.angle = 0;
    this.angleVelocity = 0;
    this.dragging = false;
    this.target = null;
    this.accumulator = 0;
    this.elapsed = 0;
    this.maxObservedStrain = 0;
  }

  setAnchor(x: number, y: number, { restLength = this.options.restLength }: { restLength?: number } = {}): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Invalid anchor');
    this.anchor = { x, y };
    this.options.restLength = restLength;
    this.reset();
  }

  beginDrag(x: number, y: number): void {
    this.dragging = true;
    this.target = { x, y };
  }

  moveDrag(x: number, y: number): void {
    if (this.dragging && Number.isFinite(x) && Number.isFinite(y)) this.target = { x, y };
  }

  endDrag(): void {
    this.dragging = false;
    this.target = null;
  }

  get endpoint(): RopeNode {
    return this.nodes[this.nodes.length - 1];
  }

  get extraPull(): number {
    return this.endpoint.y - this.anchor.y - this.options.restLength;
  }

  boundedTarget(): Point & { radius: number } {
    if (!this.target) throw new Error('No active drag target');
    // Bound any planar direction without allowing movement behind the ceiling.
    const dx = clamp(this.target.x - this.anchor.x, -145, 145);
    const dy = Math.max(25, this.target.y - this.anchor.y);
    const radius = length2(dx, dy);
    const restLength = this.options.restLength;
    const bound = radius <= restLength ? radius
      : restLength + this.options.maxPayout * Math.tanh((radius - restLength) / this.options.maxPayout);
    return {
      x: this.anchor.x + dx * bound / radius,
      y: this.anchor.y + dy * bound / radius,
      radius: bound,
    };
  }

  advance(frameDt: number): void {
    if (!Number.isFinite(frameDt) || frameDt < 0) return;
    this.accumulator += Math.min(frameDt, this.options.maxFrameDt);
    let steps = 0;
    while (this.accumulator + 1e-12 >= this.options.fixedDt && steps < this.options.maxSubsteps) {
      this.step(this.options.fixedDt);
      this.accumulator -= this.options.fixedDt;
      steps += 1;
    }
    // Do not accumulate a catch-up spiral when returning to a background tab.
    if (steps === this.options.maxSubsteps) this.accumulator = 0;
  }

  private step(dt: number): void {
    const options = this.options;
    const segments = options.segments;
    const previous = this.nodes.map((point) => ({ x: point.x, y: point.y }));
    const target = this.dragging ? this.boundedTarget() : null;
    const desiredPayout = target ? clamp(target.radius - options.restLength, 0, options.maxPayout) : 0;
    const previousPayout = this.payout;
    [this.payout, this.payoutVelocity] = springStep(
      this.payout, this.payoutVelocity, desiredPayout,
      this.dragging ? 38 : options.spoolFrequency,
      this.dragging ? 1.05 : options.spoolDampingRatio, dt,
    );
    if (this.dragging && options.maxDragPayoutSpeed > 0) {
      const ceiling = previousPayout + options.maxDragPayoutSpeed * dt;
      if (this.payout > ceiling) {
        // Limit the actual released material, so the mascot and page share one
        // physical position. Shortening and release retain their normal response.
        this.payout = ceiling;
        this.payoutVelocity = Math.min(this.payoutVelocity, options.maxDragPayoutSpeed);
      }
    }
    if (this.payout < 0) {
      this.payout = 0;
      this.payoutVelocity = 0;
    }
    if (this.payout > options.maxPayout) {
      this.payout = options.maxPayout;
      this.payoutVelocity = Math.min(0, this.payoutVelocity);
    }
    const length = options.restLength + this.payout;
    const segmentLength = length / segments;
    const damping = Math.exp(-options.damping * dt);
    for (let i = 1; i <= segments; i += 1) {
      const point = this.nodes[i];
      point.vx *= damping;
      point.vy *= damping;
      point.vy += options.gravity * dt;
      point.x += point.vx * dt;
      point.y += point.vy * dt;
    }
    if (target) {
      let dx = target.x - this.anchor.x;
      let dy = target.y - this.anchor.y;
      const radius = length2(dx, dy);
      // Pay out extra material instead of asking the rope to stretch excessively.
      if (radius > length * 1.006) {
        const ratio = length * 1.006 / radius;
        dx *= ratio;
        dy *= ratio;
      }
      const endpoint = this.endpoint;
      const next = { x: this.anchor.x + dx, y: this.anchor.y + dy };
      // Warm start the chain while keeping a small lag in its middle.
      const moveX = next.x - endpoint.x;
      const moveY = next.y - endpoint.y;
      for (let i = 1; i < segments; i += 1) {
        const weight = (i / segments) ** 2;
        this.nodes[i].x += moveX * weight;
        this.nodes[i].y += moveY * weight;
      }
      endpoint.x = next.x;
      endpoint.y = next.y;
      if (radius < length - 8) {
        // Break the symmetry of a compressed, perfectly vertical chain.
        const direction = dx < -1 ? -1 : 1;
        for (let i = 1; i < segments; i += 1) {
          this.nodes[i].x += direction * Math.sin(Math.PI * i / segments) * 0.07;
        }
      }
    }
    this.nodes[0].x = this.anchor.x;
    this.nodes[0].y = this.anchor.y;
    const lambdas = new Float64Array(segments);
    const compliance = options.compliance / (dt * dt);
    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      for (let j = 0; j < segments; j += 1) {
        const i = iteration % 2 === 0 ? j : segments - 1 - j;
        const start = this.nodes[i];
        const end = this.nodes[i + 1];
        let dx = end.x - start.x;
        let dy = end.y - start.y;
        let distance = length2(dx, dy);
        if (distance < 1e-8) {
          dx = 0.001;
          dy = segmentLength;
          distance = length2(dx, dy);
        }
        const startWeight = i === 0 ? 0 : 1;
        const endWeight = i + 1 === segments ? (this.dragging ? 0 : 0.18) : 1;
        const delta = (-(distance - segmentLength) - compliance * lambdas[i]) / (startWeight + endWeight + compliance);
        lambdas[i] += delta;
        const normalX = dx / distance;
        const normalY = dy / distance;
        start.x -= startWeight * normalX * delta;
        start.y -= startWeight * normalY * delta;
        end.x += endWeight * normalX * delta;
        end.y += endWeight * normalY * delta;
      }
    }
    // Apply a tensile cap after unusually fast input, keeping both ends reachable.
    const cap = segmentLength * (1 + options.maxStrain);
    for (let pass = 0; pass < 300 && this.currentStrain() > options.maxStrain + 0.0002; pass += 1) {
      for (let j = 0; j < segments; j += 1) {
        const i = pass % 2 === 0 ? j : segments - 1 - j;
        const start = this.nodes[i];
        const end = this.nodes[i + 1];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= cap) continue;
        const startWeight = i === 0 ? 0 : 1;
        const endWeight = i + 1 === segments ? (this.dragging ? 0 : 0.18) : 1;
        const correction = (distance - cap) / (startWeight + endWeight);
        start.x += startWeight * dx / distance * correction;
        start.y += startWeight * dy / distance * correction;
        end.x -= endWeight * dx / distance * correction;
        end.y -= endWeight * dy / distance * correction;
      }
    }
    // The upper floor prevents dragging through the outlet; no world collisions.
    for (let i = 1; i <= segments; i += 1) {
      const point = this.nodes[i];
      point.y = Math.max(this.anchor.y + 1, point.y);
      point.vx = clamp((point.x - previous[i].x) / dt, -1300, 1300);
      point.vy = clamp((point.y - previous[i].y) / dt, -1300, 1300);
    }
    const endpoint = this.endpoint;
    const previousEnd = this.nodes[segments - 2];
    const idealAngle = clamp(-Math.atan2(endpoint.x - previousEnd.x, endpoint.y - previousEnd.y) * 0.62,
      -options.maxAngle, options.maxAngle);
    [this.angle, this.angleVelocity] = springStep(
      this.angle, this.angleVelocity, idealAngle, options.angularFrequency, options.angularDampingRatio, dt,
    );
    this.angle = clamp(this.angle, -options.maxAngle, options.maxAngle);
    this.elapsed += dt;
    this.maxObservedStrain = Math.max(this.maxObservedStrain, this.currentStrain());
  }

  currentStrain(): number {
    const segmentLength = (this.options.restLength + this.payout) / this.options.segments;
    let strain = 0;
    for (let i = 1; i < this.nodes.length; i += 1) {
      strain = Math.max(strain,
        length2(this.nodes[i].x - this.nodes[i - 1].x, this.nodes[i].y - this.nodes[i - 1].y) / segmentLength - 1);
    }
    return strain;
  }

  settled(): boolean {
    return !this.dragging && this.payout < 0.025 && Math.abs(this.payoutVelocity) < 0.08
      && Math.abs(this.angleVelocity) < 0.005 && this.nodes.every((point) => length2(point.vx, point.vy) < 0.45)
      && Math.abs(this.endpoint.x - this.anchor.x) < 0.2;
  }

  snapshot(): SimulationSnapshot {
    return {
      payout: this.payout, angle: this.angle, extraPull: this.extraPull, strain: this.currentStrain(),
      dragging: this.dragging,
      endpoint: { x: this.endpoint.x, y: this.endpoint.y },
      nodes: this.nodes.map((point) => ({ x: point.x, y: point.y })),
      elapsed: this.elapsed,
    };
  }
}
