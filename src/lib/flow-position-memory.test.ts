import { describe, expect, it } from 'vitest';
import type { FlowPresentation } from './markdown';
import { browserFlowStorage, clearFlowPosition, flowPositionSettings, flowPositionStorageKey, projectFlowPosition, readFlowPosition, relativeFlowPosition, writeFlowPosition, type FlowPositionStorage } from './flow-position-memory';

const spec: FlowPresentation = { image: '/media/image.png', contour: '/media/contour.json', alt: '图片', defaultX: .53, defaultY: 54 };
function storage() {
  const records = new Map<string, string>();
  const api: FlowPositionStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); },
    removeItem: (key) => { records.delete(key); },
  };
  return { records, api };
}

describe('local flow position memory', () => {
  it('keeps article, region and repeated-image records independent without key collisions', () => {
    const { api, records } = storage();
    const keys = [flowPositionStorageKey('article-a', '/assets/a.png:1'), flowPositionStorageKey('article-a', '/assets/a.png:2'), flowPositionStorageKey('article-b', '/assets/a.png:1')];
    keys.forEach((key, index) => writeFlowPosition(api, key, 'settings', { xRatio: index / 2, y: index * 12 }));
    expect(records.size).toBe(3);
    expect(keys.map((key) => readFlowPosition(api, key, 'settings')?.y)).toEqual([0, 12, 24]);
    expect(flowPositionStorageKey('a:b', 'c')).not.toBe(flowPositionStorageKey('a', 'b:c'));
    clearFlowPosition(api, keys[0]);
    expect(records.size).toBe(2);
  });

  it('projects the same preference into changed container sizes and keeps it inside the bounds', () => {
    const position = relativeFlowPosition({ x: 300, y: 100 }, 720, 205);
    expect(projectFlowPosition(position, 720, 205)).toEqual({ x: 300, y: 100 });
    expect(projectFlowPosition(position, 620, 205)).toEqual({ x: 300 / 515 * 415, y: 100 });
    expect(relativeFlowPosition({ x: -100, y: 999 }, 720, 205)).toEqual({ xRatio: 0, y: 330 });
    expect(projectFlowPosition({ xRatio: 1, y: 330 }, 100, 205)).toEqual({ x: 0, y: 330 });
  });

  it.each([
    { ...spec, image: '/media/new-image.png' },
    { ...spec, contour: '/media/new-contour.json' },
    { ...spec, width: 180 },
    { ...spec, defaultX: .4 },
    { ...spec, defaultY: 20 },
  ])('invalidates the stored position when the effective image or defaults change: %j', (changed) => {
    const { api, records } = storage();
    writeFlowPosition(api, 'key', flowPositionSettings(spec), { xRatio: .8, y: 120 });
    expect(readFlowPosition(api, 'key', flowPositionSettings(changed))).toBeUndefined();
    expect(records.size).toBe(0);
  });

  it('treats implicit and explicit default widths identically and stores only presentation preferences', () => {
    const { api, records } = storage();
    expect(flowPositionSettings(spec)).toBe(flowPositionSettings({ ...spec, width: 205 }));
    writeFlowPosition(api, 'key', flowPositionSettings(spec), { xRatio: .6, y: 120 });
    expect(readFlowPosition(api, 'key', flowPositionSettings(spec))).toEqual({ xRatio: .6, y: 120 });
    expect(Object.keys(JSON.parse(records.get('key')!))).toEqual(['version', 'settings', 'position']);
  });

  it.each(['invalid JSON', 'null', '[]', '{}', '{"version":2}',
    JSON.stringify({ version: 1, settings: 'settings', position: { xRatio: -1, y: 10 } }),
    JSON.stringify({ version: 1, settings: 'settings', position: { xRatio: 2, y: 10 } }),
    JSON.stringify({ version: 1, settings: 'settings', position: { xRatio: .5, y: 331 } }),
    JSON.stringify({ version: 1, settings: 'settings', position: { xRatio: '.5', y: 10 } }),
  ])('ignores and clears corrupt or unsupported records: %s', (raw) => {
    const { api, records } = storage();
    records.set('key', raw);
    expect(readFlowPosition(api, 'key', 'settings')).toBeUndefined();
    expect(records.size).toBe(0);
  });

  it('tolerates denied storage access and read, write or removal failures', () => {
    const view = Object.defineProperty({}, 'localStorage', { get() { throw new Error('denied'); } }) as Window;
    expect(browserFlowStorage(view)).toBeUndefined();
    const unavailable = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('quota'); },
      removeItem() { throw new Error('denied'); },
    };
    expect(readFlowPosition(unavailable, 'key', 'settings')).toBeUndefined();
    expect(() => writeFlowPosition(unavailable, 'key', 'settings', { xRatio: .5, y: 54 })).not.toThrow();
    expect(() => clearFlowPosition(unavailable, 'key')).not.toThrow();
    expect(readFlowPosition(undefined, 'key', 'settings')).toBeUndefined();
  });

  it('refuses non-finite or invalid positions rather than serializing them into storage', () => {
    const { api, records } = storage();
    for (const position of [{ xRatio: NaN, y: 54 }, { xRatio: .5, y: Infinity }, { xRatio: 1.1, y: 54 }]) writeFlowPosition(api, 'key', 'settings', position);
    expect(records.size).toBe(0);
  });
});
