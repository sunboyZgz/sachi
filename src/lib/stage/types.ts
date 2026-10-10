export type Vec2 = readonly [number, number];
export type Rect = readonly [number, number, number, number];
export type Projection = readonly [number, number, number, number, number, number];
export type PlantAsset = 'bamboo' | 'pine-plum';
export type ReceiverId = 'wall' | 'floor' | 'desk';
export type StagePhase = 'closed' | 'preview' | 'open' | 'closing';

export type Plant = {
  id: PlantAsset;
  rect: Rect;
  pivot: Vec2;
  gain: number;
  phase: number;
};
export type Receiver = {
  id: ReceiverId;
  opacity: number;
  blur: number;
  projections: readonly Projection[];
};
export type SceneConfig = {
  size: Vec2;
  strength: number;
  targetFps: number;
  maxWidth: number;
  dprCap: number;
  shadowScale: number;
  plants: readonly Plant[];
  receivers: readonly Receiver[];
};
export type SceneImages = Record<PlantAsset | ReceiverId | 'room', HTMLImageElement>;
export type Wind = { value: number; envelope: number };
