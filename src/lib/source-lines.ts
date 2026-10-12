import type { Position } from 'unist';
import { normalizeSourceMap } from './source-text-map';

export type SourcePoint = { line: number; column: number };
export type SourceRange = { start: SourcePoint; end: SourcePoint };
export type SourceOrigin = { lineOffset: number; columnOffset?: number };
export type SourceLine = { range: SourceRange; text: string; offset: number; endOffset: number; points?: SourcePoint[] };
export type FlowSourceMap = { paragraphs: SourceLine[][][]; image: SourceRange };
export type SourceAttributes = Record<`data-source-${string}`, string | number>;

export function sourceRange(position: Position | undefined, origin: SourceOrigin): SourceRange | undefined {
  if (!position) return undefined;
  const point = ({ line, column }: SourcePoint): SourcePoint => ({ line: line + origin.lineOffset, column: column + (line === 1 ? origin.columnOffset ?? 0 : 0) });
  return { start: point(position.start), end: point(position.end) };
}

export function sourceAttributes(range: SourceRange | undefined, kind?: string): SourceAttributes {
  if (!range) return {};
  return { 'data-source-start': range.start.line, 'data-source-end': range.end.line,
    'data-source-start-column': range.start.column, 'data-source-end-column': range.end.column,
    ...(kind ? { 'data-source-kind': kind } : {}) };
}

/** CSS normal whitespace, matching the plain-text engine's input normalization. */
export function normalizeFlowText(value: string) { return value.replace(/[ \t\r\n\f]+/g, ' ').replace(/^ | $/g, ''); }

/** Pretext cursors count graphemes; DOM text offsets count UTF-16 code units. */
export function cursorOffsetLookup(segments: string[]) {
  const starts = [0];
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
  const offsets = segments.map((segment) => {
    starts.push(starts.at(-1)! + segment.length);
    return [...segmenter.segment(segment)].map((part) => part.index).concat(segment.length);
  });
  return ({ segmentIndex, graphemeIndex }: { segmentIndex: number; graphemeIndex: number }) =>
    (starts[segmentIndex] ?? starts.at(-1)!) + (offsets[segmentIndex]?.[graphemeIndex] ?? 0);
}

export function sourceRangeForOffsets(lines: SourceLine[], start: number, end: number): SourceRange | undefined {
  const first = lines.find((line) => line.endOffset > start) ?? lines.at(-1);
  const last = [...lines].reverse().find((line) => line.offset < end) ?? first;
  if (!first || !last) return undefined;
  const point = (line: SourceLine, offset: number) => {
    if (line.points) {
      const mapped = normalizeSourceMap({ text: line.text, points: line.points }).points;
      return mapped[Math.max(0, Math.min(mapped.length - 1, offset - line.offset))];
    }
    return { line: line.range.start.line, column: line.range.start.column + Math.round(Math.max(0, Math.min(1, (offset - line.offset) / Math.max(1, line.endOffset - line.offset))) * (line.range.end.column - line.range.start.column)) };
  };
  return { start: point(first, start), end: point(last, end) };
}
