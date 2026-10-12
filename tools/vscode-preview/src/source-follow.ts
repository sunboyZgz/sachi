import type { SourceRange } from '../../../src/lib/source-lines';
import type { NavigationReceipt, PreviewData, RevealLine } from './protocol';

type Candidate = { element: HTMLElement; range: SourceRange; kind: string };

/** Prefer the smallest rendered fragment containing the source point. Blank lines use the nearest block. */
export function sourceDistance(range: SourceRange, line: number, column: number) {
  const lineDistance = Math.max(range.start.line - line, line - range.end.line, 0);
  const start = line === range.start.line ? range.start.column : 1;
  const end = line === range.end.line ? range.end.column : Number.MAX_SAFE_INTEGER;
  return [lineDistance, lineDistance ? 0 : Math.max(start - column, column - Math.max(start, end - 1), 0),
    range.end.line - range.start.line, range.end.line === range.start.line ? end - start : Number.MAX_SAFE_INTEGER];
}

function textRect(element: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode();
  while (text) {
    const length = text.textContent?.length ?? 0;
    const next = walker.nextNode();
    if (offset < length || !next) {
      const range = document.createRange();
      const start = Math.min(offset, Math.max(0, length - 1));
      range.setStart(text, start);
      range.setEnd(text, Math.min(length, start + 1));
      const rect = range.getClientRects()[0];
      if (rect?.height) return rect;
    }
    offset -= length;
    text = next;
  }
  return element.getBoundingClientRect();
}

function geometry(candidate: Candidate, target: RevealLine) {
  const { element, range, kind } = candidate;
  const code = kind === 'code' ? element : element.querySelector<HTMLElement>('code[data-source-content-line]');
  if (code) {
    const lines = (code.textContent ?? '').replace(/\n$/, '').split('\n');
    const index = Math.max(0, Math.min(lines.length - 1, target.line - Number(code.dataset.sourceContentLine)));
    const offset = lines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0) + Math.min(Math.max(0, target.column - 1), lines[index].length);
    const rect = textRect(code, offset);
    const pre = code.closest('pre');
    if (pre) {
      const bounds = pre.getBoundingClientRect();
      if (rect.left < bounds.left || rect.right > bounds.right) pre.scrollLeft += rect.left - bounds.left - 24;
    }
    return rect;
  }
  if (kind === 'text' && range.start.line === range.end.line) {
    const fraction = Math.max(0, Math.min(1, (target.column - range.start.column) / Math.max(1, range.end.column - range.start.column)));
    return textRect(element, Math.floor(fraction * (element.textContent?.length ?? 0)));
  }
  return element.getBoundingClientRect();
}

export class SourceFollower {
  private data?: PreviewData;
  private pending?: RevealLine;
  private target?: RevealLine;
  private active = false;
  private enabled = true;
  private frame = 0;
  private highlighted?: HTMLElement;
  private candidates?: Candidate[];
  private ignoredSequence = -1;

  constructor(private readonly root: HTMLElement, private readonly report: (receipt: NavigationReceipt) => void) {
    // Only explicit reading/dragging cancels anchoring; programmatic scrolls do not.
    const release = () => { this.active = false; this.highlighted?.classList.remove('preview-source-target'); };
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchstart', release, { passive: true });
    window.addEventListener('pointerdown', release, { passive: true });
    window.addEventListener('keydown', (event) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Tab', ' '].includes(event.key)) release(); });
    new MutationObserver(() => { this.candidates = undefined; this.schedule(); }).observe(root, { childList: true, subtree: true, characterData: true });
    new ResizeObserver(() => this.schedule()).observe(root);
    root.addEventListener('load', () => this.schedule(), true);
    window.addEventListener('resize', () => this.schedule());
    void document.fonts.ready.then(() => this.schedule());
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; if (!enabled) { this.active = false; this.pending = undefined; this.highlighted?.classList.remove('preview-source-target'); } }

  suspend(sequence = this.ignoredSequence) { this.ignoredSequence = Math.max(sequence, this.ignoredSequence); this.active = false; this.pending = undefined; this.highlighted?.classList.remove('preview-source-target'); }

  rendered(data: PreviewData) {
    const same = this.data?.document === data.document;
    this.data = data;
    this.enabled = data.source.syncEnabled;
    this.candidates = undefined;
    if (!same) { this.target = undefined; this.active = false; }
    const request = this.pending?.document === data.document && this.pending.version >= data.source.version ? this.pending : data.source.navigation;
    // A refresh must not undo a reader's manual scroll. Only newer editor intent reactivates it.
    if (request && (!same || request.sequence > (this.target?.sequence ?? -1))) this.reveal(request);
    this.schedule();
  }

  reveal(request: RevealLine) {
    if (request.sequence <= this.ignoredSequence) return;
    if (!Number.isInteger(request.line) || !Number.isInteger(request.column) || request.line < 1 || request.column < 1) return;
    if (!this.enabled && request.reason !== 'manual') return;
    if (this.pending && this.pending.sequence > request.sequence) return;
    if (this.data?.document !== request.document || this.data.source.version < request.version) { this.active = false; this.pending = request; return; }
    if (this.data.source.version > request.version || (this.target && this.target.document === request.document && this.target.sequence >= request.sequence)) return;
    this.pending = undefined;
    this.target = request;
    this.active = true;
    this.schedule();
  }

  private schedule() {
    if (!this.active || !this.target || !this.data || this.target.document !== this.data.document || this.target.version !== this.data.source.version) return;
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.apply(); });
  }

  private apply() {
    const target = this.target;
    if (!this.active || !target || !this.data || target.version !== this.data.source.version) return;
    this.candidates ??= [...this.root.querySelectorAll<HTMLElement>('[data-source-start]')].map((element) => ({ element,
      range: { start: { line: Number(element.dataset.sourceStart), column: Number(element.dataset.sourceStartColumn) },
        end: { line: Number(element.dataset.sourceEnd), column: Number(element.dataset.sourceEndColumn) } }, kind: element.dataset.sourceKind ?? 'block' }));
    let winner: Candidate | undefined;
    let best: number[] | undefined;
    for (const candidate of this.candidates) {
      const { element } = candidate;
      const score = sourceDistance(candidate.range, target.line, target.column);
      score.push(['text', 'flow', 'code'].includes(candidate.kind) ? 0 : 1);
      const differing = best ? score.findIndex((value, index) => value !== best![index]) : -1;
      if (best && (differing < 0 || score[differing] >= best[differing])) continue;
      if (element.closest('.flow-block[data-layout="wrap"] .flow-original') || !element.getClientRects().length || !element.getBoundingClientRect().height) continue;
      best = score; winner = candidate;
    }
    if (!winner) return;
    const rect = geometry(winner, target);
    const height = window.innerHeight;
    if (target.reason === 'scroll' || target.reason === 'manual' || rect.top < height * .12 || rect.top > height * .8) {
      const top = Math.max(0, window.scrollY + rect.top - height * .25);
      if (Math.abs(top - window.scrollY) > 1) window.scrollTo({ top, behavior: 'instant' });
    }
    if (this.highlighted !== winner.element) {
      this.highlighted?.classList.remove('preview-source-target');
      winner.element.classList.add('preview-source-target');
      this.highlighted = winner.element;
    }
    const located = geometry(winner, target);
    this.report({ document: target.document, version: target.version, sequence: target.sequence, requestedLine: target.line,
      matchedLine: Math.max(winner.range.start.line, Math.min(winner.range.end.line, target.line)), reason: target.reason,
      visible: located.top < height && located.bottom > 0, scrollTop: window.scrollY, kind: winner.kind, text: (winner.element.textContent ?? '').slice(0, 160) });
  }
}
