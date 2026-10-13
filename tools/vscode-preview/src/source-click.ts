import type { SourcePoint } from '../../../src/lib/source-lines';
import type { PreviewData, RevealSource, SourceNavigationReceipt } from './protocol';

type CaretDocument = Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
const controls = 'a, button, input, textarea, select, video, audio, [role="button"], [contenteditable="true"]';

/** A caret API can return the nearest text even in a margin: require a real glyph hit. */
export function textHit(document: Document, x: number, y: number) {
  const api = document as CaretDocument;
  const caret = api.caretPositionFromPoint?.(x, y);
  const range = caret ? undefined : api.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? range?.startContainer;
  const offset = caret?.offset ?? range?.startOffset ?? 0;
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const text = node.textContent ?? '';
  for (const index of [offset, offset - 1]) {
    if (index < 0 || index >= text.length || /\s/.test(text[index])) continue;
    const glyph = document.createRange();
    glyph.setStart(node, index); glyph.setEnd(node, index + 1);
    if ([...glyph.getClientRects()].some((rect) => rect.width > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return { node: node as Text, offset };
  }
}

export function pointForText(node: Text, offset: number): SourcePoint | undefined {
  const element = node.parentElement?.closest<HTMLElement>('[data-source-map]');
  if (element) {
    try {
      const points: unknown = JSON.parse(element.dataset.sourceMap!);
      const prefix = element.ownerDocument.createRange();
      prefix.selectNodeContents(element); prefix.setEnd(node, offset);
      const index = prefix.toString().length;
      const pair = Array.isArray(points) ? points[index] : undefined;
      if (Array.isArray(pair) && pair.length === 2 && pair.every((value) => Number.isInteger(value) && value >= 1)) return { line: pair[0], column: pair[1] };
    } catch { /* The nearest AST fragment below remains a safe fallback. */ }
  }
  const fragment = node.parentElement?.closest<HTMLElement>('[data-source-start]');
  const line = Number(fragment?.dataset.sourceStart), column = Number(fragment?.dataset.sourceStartColumn);
  if (Number.isInteger(line) && line > 0 && Number.isInteger(column) && column > 0) return { line, column };
}

export class SourceClick {
  private data?: PreviewData;
  private available = false;
  private enabled = true;
  private sequence = 0;
  private pending?: number;
  private pointer?: { id: number; x: number; y: number; dragged: boolean };

  constructor(private readonly root: HTMLElement, private readonly send: (request: RevealSource) => void) {
    root.addEventListener('pointerdown', (event) => { this.pointer = event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false } : undefined; });
    root.addEventListener('pointermove', (event) => {
      if (this.pointer?.id === event.pointerId && Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y) > 5) this.pointer.dragged = true;
    });
    root.addEventListener('pointercancel', () => { this.pointer = undefined; });
    root.addEventListener('click', (event) => this.click(event));
  }
  setData(data: PreviewData) { this.data = data; this.available = true; this.enabled = data.source.clickEnabled; }
  setEnabled(enabled: boolean) { this.enabled = enabled; }
  invalidate() { this.available = false; this.pending = undefined; }
  get waiting() { return this.pending !== undefined; }
  acknowledge(receipt: SourceNavigationReceipt) {
    if (receipt.document !== this.data?.document || receipt.sequence !== this.pending) return false;
    this.pending = undefined;
    return true;
  }

  private click(event: MouseEvent) {
    const dragged = this.pointer?.dragged;
    this.pointer = undefined;
    if (!this.data || !this.available || !this.enabled || dragged || event.button !== 0 || event.detail === 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!this.root.ownerDocument.getSelection()?.isCollapsed) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(controls) || !target.closest('.article-prose, .article-title')) return;
    let point: SourcePoint | undefined;
    const image = target.closest('img, .flow-obstacle[data-interactive="false"]');
    if (image) {
      const marker = image.closest<HTMLElement>('[data-source-start]');
      const line = Number(marker?.dataset.sourceStart), column = Number(marker?.dataset.sourceStartColumn);
      if (line > 0 && column > 0) point = { line, column };
    } else {
      const hit = textHit(this.root.ownerDocument, event.clientX, event.clientY);
      if (!hit || !this.root.contains(hit.node) || hit.node.parentElement?.closest(controls) || hit.node.parentElement?.closest('.flow-block[data-layout="wrap"] .flow-original')) return;
      const title = hit.node.parentElement?.closest('.article-title');
      if (!title && !hit.node.parentElement?.closest('.article-prose')) return;
      point = title ? this.data.source.title : pointForText(hit.node, hit.offset);
    }
    if (!point) return;
    this.pending = ++this.sequence;
    this.send({ type: 'revealSource', document: this.data.document, revision: this.data.revision, version: this.data.source.version, sequence: this.sequence, ...point });
  }
}
