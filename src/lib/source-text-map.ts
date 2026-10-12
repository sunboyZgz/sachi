import type { Code, InlineCode, Text } from 'mdast';
import { decodeString } from 'micromark-util-decode-string';
import type { SourceOrigin, SourcePoint } from './source-lines';

export type SourceTextMap = { text: string; points: SourcePoint[] };
const escapeOrEntity = /\\[!-/:-@[-`{-~]|&(?:#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;

export function sourceMapAttributes(points?: SourcePoint[]) {
  return points ? { 'data-source-map': JSON.stringify(points.map(({ line, column }) => [line, column])) } : {};
}

export function joinSourceMaps(maps: SourceTextMap[], separator: string | string[] = ''): SourceTextMap {
  let text = '';
  const points: SourcePoint[] = [];
  for (const [mapIndex, map] of maps.entries()) {
    const gap = typeof separator === 'string' ? separator : separator[mapIndex - 1] ?? '';
    if (mapIndex && gap) {
      text += gap;
      for (let index = 0; index < gap.length; index++) points.push(points.at(-1) ?? map.points[0]);
    }
    if (points.length) points.pop();
    text += map.text;
    for (const point of map.points) points.push(point);
  }
  return { text, points };
}

/** Match CSS/Pretext's ASCII whitespace normalization, retaining source boundaries. */
export function normalizeSourceMap(map: SourceTextMap): SourceTextMap {
  let text = '';
  const points: SourcePoint[] = [];
  const parts = /[ \t\r\n\f]+|[^ \t\r\n\f]+/g;
  for (const match of map.text.matchAll(parts)) {
    const start = match.index;
    const whitespace = /^[ \t\r\n\f]/.test(match[0]);
    if (whitespace && (!text || start + match[0].length === map.text.length)) continue;
    if (points.length) points.pop();
    const value = whitespace ? ' ' : match[0];
    text += value;
    for (const point of whitespace ? [map.points[start], map.points[start + match[0].length]] : map.points.slice(start, start + match[0].length + 1)) points.push(point);
  }
  return { text, points: points.length ? points : [map.points[0]] };
}

export function trimSourceMap(map: SourceTextMap): SourceTextMap {
  const start = map.text.length - map.text.trimStart().length;
  const end = Math.max(start, map.text.trimEnd().length);
  // The two generated em spaces represent the original :: marker.
  if (map.text.startsWith('\u2003\u2003')) {
    return { text: `\u2003\u2003${map.text.slice(start, end)}`, points: [...map.points.slice(0, 2), ...map.points.slice(start, end + 1)] };
  }
  return { text: map.text.slice(start, end), points: map.points.slice(start, end + 1) };
}

export function sliceSourceMap(map: SourceTextMap, start: number, end: number, rendered = map.text.slice(start, end)): SourceTextMap {
  const region = map.text.slice(start, end);
  const index = region.indexOf(rendered);
  if (index >= 0) return { text: rendered, points: map.points.slice(start + index, start + index + rendered.length + 1) };
  return { text: rendered, points: Array.from({ length: rendered.length + 1 }, () => map.points[start] ?? map.points[0]) };
}

/** Maps an AST leaf locally; repeated words elsewhere in the document are irrelevant. */
export function createSourceMapper(source: string, origin: SourceOrigin) {
  const starts = [0, ...[...source.matchAll(/\r\n|\n|\r/g)].map((match) => match.index + match[0].length)];
  function point(offset: number): SourcePoint {
    let low = 0, high = starts.length;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (starts[middle] <= offset) low = middle; else high = middle;
    }
    return { line: origin.lineOffset + low + 1, column: offset - starts[low] + 1 + (low === 0 ? origin.columnOffset ?? 0 : 0) };
  }
  function decode(raw: string, start: number, literal: boolean, indent = false, pipes = false) {
    let text = '';
    const offsets: number[] = [];
    let cursor = 0;
    const pieces = literal ? pipes ? /\\\|/g : /$^/g : escapeOrEntity;
    const append = (value: string, from: number, to: number, exact: boolean) => {
      if (offsets.length) offsets.pop();
      text += value;
      for (let index = 0; index < value.length; index++) offsets.push(start + from + (exact ? index : 0));
      offsets.push(start + to);
    };
    for (const match of raw.matchAll(pieces)) {
      append(raw.slice(cursor, match.index), cursor, match.index, true);
      const decoded = literal ? '|' : decodeString(match[0]);
      append(decoded, match.index, match.index + match[0].length, decoded === match[0]);
      cursor = match.index + match[0].length;
    }
    append(raw.slice(cursor), cursor, raw.length, true);
    if (indent && /^::(?!:)/.test(raw)) {
      const removed = /^::[ \t]*/.exec(text)![0].length;
      text = `\u2003\u2003${text.slice(removed)}`;
      offsets.splice(0, removed, start, start + 1);
    }
    return { text, offsets };
  }
  function rows(raw: string, start: number) {
    let offset = start;
    return raw.split(/\r\n|\n|\r/).map((text) => {
      const row = { text, start: offset };
      offset += text.length + (source.slice(offset + text.length, offset + text.length + 2) === '\r\n' ? 2 : 1);
      return row;
    });
  }
  function leaf(node: Text | InlineCode | Code): SourceTextMap {
    const start = node.position?.start.offset ?? 0;
    const end = node.position?.end.offset ?? start;
    let raw = source.slice(start, end);
    let rawStart = start;
    const value = node.type === 'inlineCode' ? node.value.replace(/\r\n|\n|\r/g, ' ') : node.value;
    const fallback = () => ({ text: value, points: Array.from({ length: value.length + 1 }, () => point(start)) });
    if (node.type === 'inlineCode') {
      const fence = /^`+/.exec(raw)?.[0];
      if (!fence) return fallback();
      rawStart += fence.length;
      raw = raw.slice(fence.length, -fence.length);
      for (const pipes of [false, true]) {
        // Inline code normalizes newlines; construct boundaries before matching its padding.
        const literalRows = rows(raw, rawStart).map((row) => {
          const decoded = decode(row.text, row.start, true, false, pipes);
          return { text: decoded.text, points: decoded.offsets.map(point) };
        });
        const map = joinSourceMaps(literalRows, ' ');
        const index = map.text.lastIndexOf(value);
        if (index >= 0) return { text: value, points: map.points.slice(index, index + value.length + 1) };
      }
      return fallback();
    }
    if (node.type === 'code') {
      const fence = /^[`~]{3,}/.exec(raw)?.[0];
      if (fence) {
        const opening = /\r\n|\n|\r/.exec(raw);
        if (!opening) return fallback();
        rawStart += opening.index + opening[0].length;
        raw = raw.slice(opening.index + opening[0].length);
      }
    }
    const rawRows = rows(raw, rawStart);
    const parts = value.split(/\r\n|\n|\r/);
    const maps: SourceTextMap[] = [];
    for (let index = 0; index < parts.length; index++) {
      const row = rawRows[index];
      if (!row) return fallback();
      const decoded = decode(row.text, row.start, node.type === 'code', node.type === 'text' && index === 0 && !!node.data?.sachiIndent);
      const match = decoded.text.lastIndexOf(parts[index]);
      if (match < 0) return fallback();
      maps.push({ text: parts[index], points: decoded.offsets.slice(match, match + parts[index].length + 1).map(point) });
    }
    return joinSourceMaps(maps, [...value.matchAll(/\r\n|\n|\r/g)].map((match) => match[0]));
  }
  return { leaf, point };
}
