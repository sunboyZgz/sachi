import { describe, expect, it } from 'vitest';
import { splitDocument } from '../../../src/lib/blog/document';
import { imageWindowEdit } from './image-window-edit';

const body = '\n前行 &amp;\n![图][a]\n后行😀\n\n[a]: ./assets/a.png\n';
const raw = `---\nid: 51f3e126-f6a0-4ef3-a4fb-6dca72b85afd # 保留身份\ntitle: "诗: 原文"\ncreatedAt: "2026-10-14T09:00:00+08:00"\ntype: poem\n---\n${body}`;
const point = (source: string) => { const offset = source.indexOf('![图]'); const before = source.slice(0, offset); return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') }; };
const apply = (raw: string, value: { x: number; y: number; width: number; height: number } | null) => {
  const edit = imageWindowEdit(raw, './assets/a.png', point(raw), value);
  return raw.slice(0, edit.start) + edit.text + raw.slice(edit.end);
};
describe('version-guarded editor image-window metadata edits', () => {
  it('keeps body, identity, quoted metadata, comments, BOM and CRLF exact', () => {
    const source = '\uFEFF' + raw.replaceAll('\n', '\r\n');
    const next = apply(source, { x: .1, y: .2, width: .6, height: .5 });
    expect(next.startsWith('\uFEFF---\r\n')).toBe(true);
    expect(next.replaceAll('\r\n', '')).not.toContain('\n');
    expect(splitDocument(next).bodyRaw).toBe(splitDocument(source).bodyRaw);
    expect(next).toContain('# 保留身份'); expect(next).toContain('title: "诗: 原文"');
    expect(splitDocument(next).data.id).toBe(splitDocument(source).data.id);
    expect(splitDocument(next).data.imageWindows).toEqual({ './assets/a.png': { x: .1, y: .2, width: .6, height: .5 } });
    expect(splitDocument(apply(next, null)).data.imageWindows).toBeUndefined();
  });
  it('updates only the selected image while preserving comments and the other window', () => {
    const source = raw.replace('type: poem', 'type: poem\nimageWindows:\n  /assets/a.png:\n    x: 0.2 # 横向说明\n    y: 0.2\n    width: 0.5\n    height: 0.5\n  ./assets/b.png: { x: 0, y: 0, width: 0.5, height: 0.5 }');
    const next = apply(source, { x: .1, y: .1, width: .8, height: .8 });
    expect(next).toContain('# 横向说明');
    expect(splitDocument(next).data.imageWindows).toEqual({ '/assets/a.png': { x: .1, y: .1, width: .8, height: .8 }, './assets/b.png': { x: 0, y: 0, width: .5, height: .5 } });
    expect(splitDocument(apply(next, null)).data.imageWindows).toEqual({ './assets/b.png': { x: 0, y: 0, width: .5, height: .5 } });
  });
  it('rejects wrong locations, wrong resources, invalid windows and math/code examples', () => {
    expect(() => imageWindowEdit(raw, './assets/a.png', { line: 1, column: 1 }, null)).toThrow('图片语句已变化');
    expect(() => imageWindowEdit(raw, './assets/b.png', point(raw), null)).toThrow('图片语句已变化');
    expect(() => apply(raw, { x: .9, y: 0, width: .5, height: 1 })).toThrow();
    for (const source of [raw.replace('![图][a]', '`![图][a]`'), raw.replace('![图][a]', '$![图][a]$')]) expect(() => apply(source, null)).toThrow('图片语句已变化');
  });
});
