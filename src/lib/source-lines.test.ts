import { describe, expect, it } from 'vitest';
import { cursorOffsetLookup, sourceRangeForOffsets } from './source-lines';
import { parseMarkdown } from './markdown';
import { sourceDistance } from '../../tools/vscode-preview/src/source-follow';

describe('preview source geometry', () => {
  it('maps grapheme cursors to DOM offsets for Chinese, emoji and combining characters', () => {
    const offset = cursorOffsetLookup(['中文', '👨‍👩‍👧‍👦é', '结尾']);
    expect(offset({ segmentIndex: 0, graphemeIndex: 1 })).toBe(1);
    expect(offset({ segmentIndex: 1, graphemeIndex: 1 })).toBe(13);
    expect(offset({ segmentIndex: 1, graphemeIndex: 2 })).toBe(15);
    expect(offset({ segmentIndex: 3, graphemeIndex: 0 })).toBe(17);
  });

  it('retains source lines through compact breaks, indentation, soft breaks and the flow boundary', () => {
    const body = '::第一行。\\\n::第二行。\n软行。\n\n![图](./x.png)\n\n## 后续\n\n正文。';
    const flow = { image: './x.png', defaultX: 0.53, defaultY: 86 };
    const parsed = parseMarkdown(body, flow, {}, { lineOffset: 10 });
    const source = parsed.flow!.source!;
    expect(source.paragraphs[0].map((chunk) => chunk.map((line) => line.range.start.line))).toEqual([[11], [12, 13]]);
    expect(source.image.start.line).toBe(15);
    expect(parsed.sourceOrigin).toEqual({ lineOffset: 16 });
    expect(sourceRangeForOffsets(source.paragraphs[0][1], 0, 6)).toEqual({ start: { line: 12, column: 1 }, end: { line: 12, column: 7 } });
    expect(sourceRangeForOffsets(source.paragraphs[0][1], 7, 10)).toEqual({ start: { line: 13, column: 1 }, end: { line: 13, column: 4 } });
    expect(parseMarkdown(body, flow).flow?.source).toBeUndefined();
  });

  it('ranks exact source fragments above containing blocks, and blank lines by distance', () => {
    const block = { start: { line: 10, column: 1 }, end: { line: 20, column: 30 } };
    const text = { start: { line: 12, column: 4 }, end: { line: 12, column: 16 } };
    expect(sourceDistance(block, 12, 8)).toEqual([0, 0, 10, Number.MAX_SAFE_INTEGER]);
    expect(sourceDistance(text, 12, 8)).toEqual([0, 0, 0, 12]);
    expect(sourceDistance(text, 12, 2).slice(0, 2)).toEqual([0, 2]);
    expect(sourceDistance(text, 12, 16).slice(0, 2)).toEqual([0, 1]);
    expect(sourceDistance(text, 14, 1)[0]).toBe(2);
  });
});
