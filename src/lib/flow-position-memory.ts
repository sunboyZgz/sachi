import { clampPosition, maxFlowY, type Position } from './flow-geometry';
import type { FlowPresentation } from './markdown';

export type RelativeFlowPosition = { xRatio: number; y: number };
export type FlowPositionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const flowPositionPrefix = 'sachi:flow-position:v1:';

export function flowPositionStorageKey(article: string, region: string) {
  return `${flowPositionPrefix}${encodeURIComponent(article)}:${encodeURIComponent(region)}`;
}

/** Effective image/configuration identity; body edits do not reset reading preferences. */
export function flowPositionSettings(spec: FlowPresentation) {
  return JSON.stringify([spec.image, spec.contour ?? '', spec.width ?? 205, spec.defaultX, spec.defaultY]);
}

export function browserFlowStorage(view: Pick<Window, 'localStorage'> | null | undefined): FlowPositionStorage | undefined {
  try { return view?.localStorage; }
  catch { return undefined; }
}

function isRelativePosition(value: unknown): value is RelativeFlowPosition {
  if (!value || typeof value !== 'object') return false;
  const { xRatio, y } = value as Partial<RelativeFlowPosition>;
  return typeof xRatio === 'number' && Number.isFinite(xRatio) && xRatio >= 0 && xRatio <= 1
    && typeof y === 'number' && Number.isFinite(y) && y >= 0 && y <= maxFlowY;
}

export function clearFlowPosition(storage: FlowPositionStorage | undefined, key: string) {
  try { storage?.removeItem(key); }
  catch { /* Storage is optional; resetting the current reading still succeeds. */ }
}

export function readFlowPosition(storage: FlowPositionStorage | undefined, key: string, settings: string): RelativeFlowPosition | undefined {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object') {
      const record = value as { version?: unknown; settings?: unknown; position?: unknown };
      if (record.version === 1 && record.settings === settings && isRelativePosition(record.position)) {
        return { xRatio: record.position.xRatio, y: record.position.y };
      }
    }
  } catch { /* Malformed records and denied reads must not block article layout. */ }
  clearFlowPosition(storage, key);
  return undefined;
}

export function writeFlowPosition(storage: FlowPositionStorage | undefined, key: string, settings: string, position: RelativeFlowPosition) {
  if (!storage || !isRelativePosition(position)) return;
  try { storage.setItem(key, JSON.stringify({ version: 1, settings, position })); }
  catch { /* Quota limits and denied writes leave interaction available. */ }
}

export function relativeFlowPosition(position: Position, width: number, imageWidth: number): RelativeFlowPosition {
  const clamped = clampPosition(position, width, imageWidth);
  const availableWidth = Math.max(0, width - imageWidth);
  return { xRatio: availableWidth ? clamped.x / availableWidth : 0, y: clamped.y };
}

export function projectFlowPosition(position: RelativeFlowPosition, width: number, imageWidth: number): Position {
  return clampPosition({ x: position.xRatio * Math.max(0, width - imageWidth), y: position.y }, width, imageWidth);
}
