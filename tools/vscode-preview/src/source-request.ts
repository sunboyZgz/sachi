import type { PreviewData, RevealSource } from './protocol';

export function currentSourceRequest(request: RevealSource, data: PreviewData, document: { file: string; version: number; lineLengths: number[] }, lastSequence: number) {
  return data.source.clickEnabled && request.document === document.file && request.document === data.document && request.revision === data.revision && request.version === document.version && request.version === data.source.version &&
    Number.isSafeInteger(request.sequence) && request.sequence > lastSequence && Number.isSafeInteger(request.line) && request.line >= 1 && request.line <= document.lineLengths.length &&
    Number.isSafeInteger(request.column) && request.column >= 1 && request.column <= document.lineLengths[request.line - 1] + 1;
}
