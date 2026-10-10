import { DEFAULTS } from './config/defaults';
import { RopeSimulation } from './physics';
import { CanvasRopeRenderer, loadImage } from './renderer';
import type { Point, ResolvedRopeOptions, RopeActivation, RopeImages, RopeOptions, RopePhase, RopeSnapshot } from './types';

/** Importing this module creates no timers, globals or DOM nodes. */
export async function createRopeEntry(options: RopeOptions): Promise<RopeEntry> {
  if (!(options.host instanceof HTMLElement)) throw new TypeError('host must be an HTMLElement');
  const assetBase = options.assetBase ?? './assets/';
  const paths = {
    mascot: `${assetBase}mascot-front.webp`,
    rope: `${assetBase}rope-tile.png`,
    knot: `${assetBase}end-knot.png`,
    ...options.assets,
  };
  const [mascot, rope, knot] = await Promise.all([loadImage(paths.mascot), loadImage(paths.rope), loadImage(paths.knot)]);
  const entry = new RopeEntry(options, { mascot, rope, knot });
  entry.mount();
  return entry;
}

export class RopeEntry {
  private readonly host: HTMLElement;
  private readonly options: ResolvedRopeOptions;
  private readonly canvas: HTMLCanvasElement;
  private readonly button: HTMLButtonElement;
  private readonly simulation: RopeSimulation;
  private readonly renderer: CanvasRopeRenderer;
  private readonly eventController = new AbortController();
  private readonly motionQuery: MediaQueryList;
  private resizeObserver?: ResizeObserver;
  private frame: number | null = null;
  private lastTime: number | null = null;
  private pointerId: number | null = null;
  private started: Point = { x: 0, y: 0 };
  private grabOffset: Point = { x: 0, y: 0 };
  private width = 0;
  private height = 0;
  private idleFrames = 0;
  private maxPointerTravel = 0;
  private phase: RopePhase = 'idle';
  private armed = false;
  private activationCount = 0;
  private lastActivation = -Infinity;
  private isDestroyed = false;
  private isDisabled = false;
  private reducedMotion: boolean;

  constructor(options: RopeOptions, images: RopeImages) {
    this.host = options.host;
    this.options = { ...DEFAULTS, ...options };
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mutou-rope-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'mutou-rope-handle';
    this.button.setAttribute('aria-label', this.options.ariaLabel);
    const label = document.createElement('span');
    label.className = 'mutou-rope-sr';
    label.textContent = '打开彩蛋';
    this.button.append(label);
    this.simulation = new RopeSimulation(this.options);
    this.renderer = new CanvasRopeRenderer(this.canvas, images, this.options);
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.motionQuery.matches;
  }

  get disabled(): boolean { return this.isDisabled; }
  get destroyed(): boolean { return this.isDestroyed; }
  get triggerDistance(): number { return this.options.triggerDistance; }

  mount(): void {
    this.host.classList.add('mutou-rope-host');
    this.host.append(this.canvas, this.button);
    // Native event maps infer each handler's event type; abort removes them all.
    const { signal } = this.eventController;
    this.button.addEventListener('pointerdown', (event) => this.pointerDown(event), { signal });
    this.button.addEventListener('pointermove', (event) => this.pointerMove(event), { signal });
    this.button.addEventListener('pointerup', (event) => this.pointerUp(event), { signal });
    this.button.addEventListener('pointercancel', (event) => {
      if (event.pointerId === this.pointerId) this.cancel();
    }, { signal });
    this.button.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === this.pointerId) this.cancel();
    }, { signal });
    this.button.addEventListener('click', (event) => {
      if (event.detail === 0 && !this.disabled) this.activate('keyboard');
    }, { signal });
    this.button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.cancel();
      }
    }, { signal });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.pointerId !== null) this.cancel();
    }, { signal });
    window.addEventListener('blur', () => this.cancel(), { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.cancel();
        this.stop();
      } else {
        this.lastTime = null;
        this.wake();
      }
    }, { signal });
    this.motionQuery.addEventListener('change', (event) => {
      this.reducedMotion = event.matches;
      this.cancel();
      this.stop();
      this.simulation.reset();
      this.phase = 'idle';
      this.draw();
    }, { signal });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
  }

  private resize(): void {
    if (this.destroyed) return;
    const bounds = this.host.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return;
    this.cancel();
    this.stop();
    this.width = this.host.clientWidth;
    this.height = this.host.clientHeight;
    const layout = this.options.layout?.({ width: this.width, height: this.height }) ?? {
      anchorX: this.width / 2, anchorY: 15,
      restLength: this.options.restLength, mascotWidth: this.options.mascotWidth,
    };
    for (const key of ['mascotWidth', 'ropeWidth'] as const) {
      if (layout[key] !== undefined) this.options[key] = layout[key];
    }
    if (layout.pull) {
      Object.assign(this.options, layout.pull);
      this.simulation.options.maxPayout = layout.pull.maxPayout;
      this.simulation.options.maxDragPayoutSpeed = layout.pull.maxDragPayoutSpeed;
    }
    this.simulation.setAnchor(layout.anchorX, layout.anchorY, { restLength: layout.restLength ?? this.options.restLength });
    this.phase = this.disabled ? 'disabled' : 'idle';
    this.renderer.resize(this.width, this.height, devicePixelRatio || 1);
    this.lastTime = null;
    this.draw();
  }

  private localPoint(event: PointerEvent): Point {
    const bounds = this.host.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * this.width / bounds.width,
      y: (event.clientY - bounds.top) * this.height / bounds.height,
    };
  }

  private pointerDown(event: PointerEvent): void {
    if (this.disabled || this.destroyed || this.pointerId !== null || !event.isPrimary
      || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.started = this.localPoint(event);
    this.maxPointerTravel = 0;
    const endpoint = this.simulation.endpoint;
    this.grabOffset = { x: this.started.x - endpoint.x, y: this.started.y - endpoint.y };
    this.armed = false;
    this.phase = 'dragging';
    this.button.classList.add('is-dragging');
    this.button.setPointerCapture(event.pointerId);
    this.simulation.beginDrag(endpoint.x, endpoint.y);
    this.wake();
  }

  private pointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    const point = this.localPoint(event);
    this.maxPointerTravel = Math.max(this.maxPointerTravel, Math.hypot(point.x - this.started.x, point.y - this.started.y));
    this.simulation.moveDrag(point.x - this.grabOffset.x, point.y - this.grabOffset.y);
    this.wake();
  }

  private updateArmed(): void {
    if (this.pointerId === null) return;
    const sideways = Math.abs(this.simulation.endpoint.x - this.simulation.anchor.x);
    const down = this.simulation.extraPull;
    if (!this.armed && down >= this.options.triggerDistance && sideways <= this.options.triggerMaxSideways) this.armed = true;
    if (this.armed && (down < this.options.triggerDistance - this.options.triggerHysteresis
      || sideways > this.options.triggerMaxSideways + 8)) this.armed = false;
    this.phase = this.armed ? 'armed' : 'dragging';
    this.button.dataset.armed = String(this.armed);
  }

  private pointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    // Pointer up can arrive without a final move; retain the release location.
    const point = this.localPoint(event);
    this.simulation.moveDrag(point.x - this.grabOffset.x, point.y - this.grabOffset.y);
    this.updateArmed();
    const finalDown = point.y - this.grabOffset.y - this.simulation.anchor.y - this.simulation.options.restLength;
    const finalSideways = Math.abs(point.x - this.grabOffset.x - this.simulation.anchor.x);
    const validPull = this.armed && finalDown >= this.options.triggerDistance - this.options.triggerHysteresis
      && finalSideways <= this.options.triggerMaxSideways + 8;
    const tap = this.maxPointerTravel < 6;
    this.releaseCapture();
    this.simulation.endDrag();
    this.armed = false;
    this.phase = 'returning';
    if (validPull) this.activate('pull');
    else if (tap && (this.options.activateOnClick || this.reducedMotion)) this.activate('tap');
    if (this.reducedMotion) {
      this.stop();
      this.simulation.reset();
      this.phase = 'idle';
      this.draw();
    } else this.wake();
  }

  private releaseCapture(): void {
    const id = this.pointerId;
    this.pointerId = null;
    this.button.classList.remove('is-dragging');
    delete this.button.dataset.armed;
    if (id !== null && this.button.hasPointerCapture(id)) this.button.releasePointerCapture(id);
  }

  private cancel(): void {
    if (this.destroyed) return;
    const wasDragging = this.pointerId !== null;
    this.releaseCapture();
    this.simulation.endDrag();
    this.armed = false;
    if (wasDragging) {
      this.phase = 'returning';
      if (this.reducedMotion) {
        this.stop();
        this.simulation.reset();
        this.phase = 'idle';
        this.draw();
      } else this.wake();
    }
  }

  private activate(source: RopeActivation['source']): boolean {
    if (this.disabled || this.destroyed) return false;
    const now = performance.now();
    if (now - this.lastActivation < this.options.cooldownMs) return false;
    this.lastActivation = now;
    this.activationCount += 1;
    const detail: RopeActivation = {
      source, count: this.activationCount, pull: this.simulation.extraPull, payout: this.simulation.payout,
    };
    this.host.dispatchEvent(new CustomEvent<RopeActivation>('ropeactivate', { detail, bubbles: true }));
    this.options.onActivate?.(detail);
    return true;
  }

  private wake(): void {
    if (this.destroyed || this.disabled || document.hidden) return;
    if (this.frame === null) {
      this.lastTime = null;
      this.frame = requestAnimationFrame((time) => this.tick(time));
    }
  }

  private stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.lastTime = null;
  }

  private tick(time: number): void {
    this.frame = null;
    if (this.destroyed || this.disabled || document.hidden) return;
    const dt = this.lastTime === null ? 0 : (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (this.reducedMotion && this.simulation.dragging) {
      // Direct displacement only, without inertial animation in reduced motion.
      const target = this.simulation.boundedTarget();
      const dx = target.x - this.simulation.anchor.x;
      const dy = target.y - this.simulation.anchor.y;
      this.simulation.nodes.forEach((point, index) => {
        const ratio = index / this.simulation.options.segments;
        point.x = this.simulation.anchor.x + dx * ratio;
        point.y = this.simulation.anchor.y + dy * ratio;
        point.vx = point.vy = 0;
      });
      this.simulation.payout = Math.max(0, target.radius - this.simulation.options.restLength);
      this.simulation.angle = 0;
    } else this.simulation.advance(dt);
    this.updateArmed();
    if (this.simulation.settled()) this.idleFrames += 1;
    else this.idleFrames = 0;
    if (this.idleFrames > 8) {
      this.phase = 'idle';
      this.stop();
      this.draw();
      return;
    }
    this.draw();
    this.frame = requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  private draw(): void {
    if (this.destroyed) return;
    const geometry = this.renderer.draw(this.simulation);
    Object.assign(this.button.style, {
      width: `${geometry.width}px`, height: `${geometry.height}px`,
      left: `${geometry.x - geometry.attachX}px`, top: `${geometry.y - geometry.attachY}px`,
      transformOrigin: `${geometry.attachX}px ${geometry.attachY}px`,
      transform: `rotate(${geometry.angle}rad)`,
    });
    this.host.dataset.ropeState = this.phase;
    this.options.onUpdate?.(this.snapshot());
  }

  snapshot(): RopeSnapshot {
    return {
      ...this.simulation.snapshot(), phase: this.phase, reducedMotion: this.reducedMotion,
      activationCount: this.activationCount, rafActive: this.frame !== null,
      mascot: this.renderer.mascotGeometry(this.simulation.endpoint, this.simulation.angle),
    };
  }

  reset(): void {
    this.cancel();
    this.stop();
    this.simulation.reset();
    this.phase = 'idle';
    this.draw();
  }

  setDebug(enabled: boolean): void {
    this.renderer.debug = enabled;
    this.draw();
  }

  setDisabled(disabled: boolean): void {
    this.isDisabled = disabled;
    this.button.disabled = disabled;
    this.cancel();
    if (disabled) {
      this.stop();
      this.phase = 'disabled';
    } else {
      this.phase = 'idle';
      this.wake();
    }
    this.draw();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.cancel();
    this.stop();
    this.resizeObserver?.disconnect();
    this.eventController.abort();
    this.isDestroyed = true;
    this.renderer.destroy();
    this.canvas.remove();
    this.button.remove();
    this.host.classList.remove('mutou-rope-host');
    delete this.host.dataset.ropeState;
  }
}
