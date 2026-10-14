import type { Data, PhrasingContent } from 'mdast';
import type { Parent } from 'unist';
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Code, Construct, Extension, Resolver, State, Token, Tokenizer } from 'micromark-util-types';
import { classifyCharacter } from 'micromark-util-classify-character';
import { splice } from 'micromark-util-chunked';
import { resolveAll } from 'micromark-util-resolve-all';
import type { Processor } from 'unified';

export interface TextSize extends Parent {
  type: 'textSize';
  size: 'larger' | 'smaller';
  factor?: number;
  children: PhrasingContent[];
  data?: Data;
}

declare module 'mdast' {
  interface PhrasingContentMap { textSize: TextSize }
  interface RootContentMap { textSize: TextSize }
}
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    textSize: 'textSize';
    textSizeText: 'textSizeText';
    textSizeSequence: 'textSizeSequence';
    textSizeSequenceTemporary: 'textSizeSequenceTemporary';
    textSizeFactorTemporary: 'textSizeFactorTemporary';
    textSizeFactor: 'textSizeFactor';
  }
  interface Token { _sachiSize?: TextSize['size']; _sachiFactor?: number }
}

const wordCharacter = (code: Code) => code !== null && code > 0 && /[A-Za-z0-9_]/u.test(String.fromCharCode(code));

/** Paired, same-line delimiters; micromark keeps escapes, code and destinations opaque. */
function textSizeSyntax(): Extension {
  const resolve: Resolver = (events, context) => {
    for (let index = 0; index < events.length; index++) {
      const closing = events[index][1];
      if (events[index][0] !== 'enter' || closing.type !== 'textSizeSequenceTemporary' || !closing._close) continue;
      for (let open = index - 1; open >= 0; open--) {
        const opening = events[open][1];
        if (opening.end.line < closing.start.line) break;
        if (events[open][0] !== 'exit' || opening.type !== 'textSizeSequenceTemporary' || !opening._open || opening._sachiSize !== closing._sachiSize) continue;
        opening.type = closing.type = 'textSizeSequence';
        const after = events[index + 2]?.[1];
        const factor = after?.type === 'textSizeFactorTemporary' && after.start.offset === closing.end.offset ? after : undefined;
        if (factor) factor.type = 'textSizeFactor';
        const span: Token = { type: 'textSize', start: { ...opening.start }, end: { ...(factor ?? closing).end }, _sachiSize: opening._sachiSize, _sachiFactor: factor?._sachiFactor };
        const content: Token = { type: 'textSizeText', start: { ...opening.end }, end: { ...closing.start } };
        const inside = resolveAll(context.parser.constructs.insideSpan.null ?? [], events.slice(open + 1, index), context);
        // Mutate the shared event array; chunked insertion also supports very long content.
        const replacement: typeof events = [
          ['enter', span, context], ['enter', opening, context], ['exit', opening, context], ['enter', content, context],
          ...inside,
          ['exit', content, context], ['enter', closing, context], ['exit', closing, context],
          ...(factor ? [['enter', factor, context], ['exit', factor, context]] as typeof events : []),
          ['exit', span, context],
        ];
        splice(events, open - 1, index - open + 3 + (factor ? 2 : 0), replacement);
        index = open + replacement.length - 2;
        break;
      }
    }
    for (const event of events) if (event[1].type === 'textSizeSequenceTemporary' || event[1].type === 'textSizeFactorTemporary') event[1].type = 'data';
    return events;
  };
  const tokenize: Tokenizer = function (effects, ok, nok) {
    const previous = this.previous;
    const previousToken = this.events.at(-1)?.[1];
    let marker: Code;
    let length = 0;
    const more: State = (code) => {
      if (code === marker) {
        if (length === 2) return nok(code);
        effects.consume(code); length++;
        return more;
      }
      if (length !== 2) return nok(code);
      const token = effects.exit('textSizeSequenceTemporary');
      token._sachiSize = marker === 43 ? 'larger' : 'smaller';
      token._open = classifyCharacter(code) !== 1 && !wordCharacter(previous);
      token._close = classifyCharacter(previous) !== 1 && !wordCharacter(code);
      return ok(code);
    };
    return (code) => {
      marker = code;
      if (previous === marker && previousToken?.type !== 'characterEscape') return nok(code);
      effects.enter('textSizeSequenceTemporary');
      return more(code);
    };
  };
  const construct: Construct = { name: 'textSize', tokenize, resolveAll: resolve };
  const factor: Construct = {
    name: 'textSizeFactor', resolveAll: resolve,
    tokenize(effects, ok, nok) {
      const previous = this.events.at(-1)?.[1];
      let value = '';
      const end: State = (code) => {
        const token = effects.exit('textSizeFactorTemporary');
        token._sachiFactor = Number(value);
        return ok(code);
      };
      const digits: State = (code) => {
        if (code !== null && (code >= 48 && code <= 57 || code === 46)) {
          value += String.fromCharCode(code); effects.consume(code);
          return digits;
        }
        const number = Number(value);
        if (code !== 125 || !/^(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value) || !Number.isFinite(number) || number <= 0 || !Number.isFinite(1 / number)) return nok(code);
        effects.consume(code);
        return end;
      };
      return (code) => {
        if (previous?.type !== 'textSizeSequenceTemporary') return nok(code);
        effects.enter('textSizeFactorTemporary'); effects.consume(code);
        return digits;
      };
    },
  };
  return { text: { 43: construct, 45: construct, 123: factor }, insideSpan: { null: [construct] }, attentionMarkers: { null: [43, 45] } };
}

const fromMarkdown: FromMarkdownExtension = {
  enter: {
    textSize(token) {
      const size = token._sachiSize!;
      const factor = token._sachiFactor;
      const scale = factor === undefined ? undefined : size === 'larger' ? factor : 1 / factor;
      this.enter({ type: 'textSize', size, ...(factor === undefined ? {} : { factor }), children: [], data: { hName: 'span', hProperties: {
        className: [`markdown-text-${size}`], ...(scale === undefined ? {} : { style: `font-size: ${scale}em` }),
      } } }, token);
    },
  },
  exit: { textSize(token) { this.exit(token); } },
};

/** A syntax extension, rather than source rewriting, preserves every original source offset. */
export function remarkTextSize(this: Processor) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(textSizeSyntax());
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);
}
