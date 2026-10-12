import { describe, expect, it } from 'vitest';
import { currentSourceRequest } from './source-request';
import type { PreviewData, RevealSource } from './protocol';

const data = { document: '/temporary/article.md', revision: 8, source: { version: 3, clickEnabled: true } } as PreviewData;
const document = { file: data.document, version: 3, lineLengths: [5, 10] };
const request: RevealSource = { type: 'revealSource', document: data.document, version: 3, revision: 8, sequence: 2, line: 2, column: 11 };

describe('preview navigation request boundary', () => {
  it('accepts a collapsed caret at the end of the current line', () => { expect(currentSourceRequest(request, data, document, 1)).toBe(true); });
  it.each([{ document: '/other/article.md' }, { version: 2 }, { revision: 7 }, { sequence: 1 }, { sequence: NaN }, { line: 0 }, { line: 3 }, { line: 1.5 }, { column: 0 }, { column: 12 }, { column: Infinity }])('rejects stale, foreign or invalid targets: %j', (override) => {
    expect(currentSourceRequest({ ...request, ...override }, data, document, 1)).toBe(false);
  });
  it('rejects disabled navigation and a newer unsaved document version', () => {
    expect(currentSourceRequest(request, { ...data, source: { ...data.source, clickEnabled: false } }, document, 1)).toBe(false);
    expect(currentSourceRequest(request, data, { ...document, version: 4 }, 1)).toBe(false);
  });
});
