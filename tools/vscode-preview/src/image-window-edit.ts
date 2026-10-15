import { isMap } from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import { splitDocument } from '../../../src/lib/blog/document';
import { imageResolver } from '../../../src/lib/markdown';
import { imageWindowSchema, imageWindowsSchema, isFullImageWindow, type ImageWindow } from '../../../src/lib/image-window';
import type { SourcePoint } from '../../../src/lib/source-lines';

/** A minimal metadata edit for VS Code undo; never touches body text or media bytes. */
export function imageWindowEdit(raw: string, reference: string, point: SourcePoint, value: ImageWindow | null) {
  const { document, data, bodyRaw } = splitDocument(raw);
  const normalized = (value: string) => decodeURIComponent(value).replace(/^\.\//u, '/');
  imageWindowsSchema.parse({ [reference]: value ?? { x: 0, y: 0, width: 1, height: 1 } });
  if (data.imageWindows !== undefined) imageWindowsSchema.parse(data.imageWindows);
  const prefix = raw.slice(0, raw.length - bodyRaw.length);
  const lines = (prefix.match(/\n/gu) ?? []).length;
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(bodyRaw);
  const resolve = imageResolver(tree);
  let found = false;
  visit(tree, (node) => {
    if ((node.type === 'image' || node.type === 'imageReference') && node.position &&
      node.position.start.line + lines === point.line && node.position.start.column === point.column && normalized(resolve(node) ?? '') === normalized(reference)) found = true;
  });
  if (!found) throw new Error('图片语句已变化，请重新打开图片裁剪。');
  const window = value === null ? null : imageWindowSchema.parse(value);
  const existing = document.get('imageWindows', true);
  if (existing !== undefined && !isMap(existing)) throw new Error('请先将 imageWindows 修正为图片地址与窗口的映射。');
  const key = isMap(existing) ? Object.keys(data.imageWindows as object).find((key) => normalized(key) === normalized(reference)) ?? reference : reference;
  if (window && !isFullImageWindow(window)) {
    if (!document.has('imageWindows')) document.set('imageWindows', document.createNode({}));
    const previous = document.getIn(['imageWindows', key], true);
    if (isMap(previous)) for (const [field, value] of Object.entries(window)) previous.set(field, value);
    else document.setIn(['imageWindows', key], document.createNode(window));
  } else if (isMap(existing)) {
    existing.delete(key);
    if (existing.items.length === 0) document.delete('imageWindows');
  }
  const opening = /^(?:\uFEFF)?---\r?\n/u.exec(raw)!;
  const closing = /---(?:\r?\n|$)$/u.exec(prefix)!;
  const eol = opening[0].endsWith('\r\n') ? '\r\n' : '\n';
  return { start: opening[0].length, end: closing.index, text: document.toString().replaceAll('\n', eol) };
}
