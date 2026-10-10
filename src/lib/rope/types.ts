export type Point = { x: number; y: number };
export type RopeNode = Point & { vx: number; vy: number };
export type RopePhase = 'idle' | 'dragging' | 'armed' | 'returning' | 'disabled';

export type RopePhysicsConfig = {
  segments: number;
  restLength: number;
  maxPayout: number;
  /** CSS px/s while paying out during a drag; zero leaves the speed unlimited. */
  maxDragPayoutSpeed: number;
  gravity: number;
  compliance: number;
  maxStrain: number;
  iterations: number;
  damping: number;
  spoolFrequency: number;
  spoolDampingRatio: number;
  angularFrequency: number;
  angularDampingRatio: number;
  maxAngle: number;
  fixedDt: number;
  maxFrameDt: number;
  maxSubsteps: number;
};

export type RopeConfig = RopePhysicsConfig & {
  ropeWidth: number;
  mascotWidth: number;
  triggerDistance: number;
  triggerMaxSideways: number;
  triggerHysteresis: number;
  activateOnClick: boolean;
  cooldownMs: number;
  pixelRatioCap: number;
  showKnot: boolean;
  ariaLabel: string;
};

export type RopeActivation = {
  source: 'pull' | 'keyboard' | 'tap';
  count: number;
  pull: number;
  payout: number;
};

export type RopePullSettings = Pick<RopeConfig, 'maxPayout' | 'maxDragPayoutSpeed' | 'triggerDistance' | 'triggerHysteresis'>;

export type MascotGeometry = Point & {
  angle: number;
  width: number;
  height: number;
  attachX: number;
  attachY: number;
  scale: number;
};

export type SimulationSnapshot = {
  payout: number;
  angle: number;
  extraPull: number;
  strain: number;
  dragging: boolean;
  endpoint: Point;
  nodes: Point[];
  elapsed: number;
};

export type RopeSnapshot = SimulationSnapshot & {
  phase: RopePhase;
  reducedMotion: boolean;
  activationCount: number;
  rafActive: boolean;
  mascot: MascotGeometry;
};

export type RopeLayout = {
  anchorX: number;
  anchorY: number;
  restLength?: number;
  mascotWidth?: number;
  ropeWidth?: number;
  pull?: Readonly<RopePullSettings>;
};

export type RopeAssets = { mascot: string; rope: string; knot: string };
export type RopeImages = { mascot: HTMLImageElement; rope: HTMLImageElement; knot: HTMLImageElement };
export type SimulationOptions = Partial<RopePhysicsConfig> & { anchorX?: number; anchorY?: number };

export type RopeOptions = Partial<RopeConfig> & {
  host: HTMLElement;
  assetBase?: string;
  assets?: Partial<RopeAssets>;
  layout?: (size: { width: number; height: number }) => RopeLayout;
  onActivate?: (detail: RopeActivation) => void;
  onUpdate?: (snapshot: RopeSnapshot) => void;
};

export type ResolvedRopeOptions = RopeConfig & RopeOptions;
