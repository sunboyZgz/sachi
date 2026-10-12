import type { Paragraph, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { analyzeArticleStructure, type ArticleHeading } from './article-structure';
import type { Asset, FlowSpec } from './blog/schema';
import { firstLineIndent, remarkFirstLineIndent } from './remark-first-line-indent';
import { normalizeFlowText, sourceRange, type FlowSourceMap, type SourceLine, type SourceOrigin } from './source-lines';
import { createSourceMapper, joinSourceMaps, trimSourceMap, type SourceTextMap } from './source-text-map';

export type { ArticleHeading } from './article-structure';
export type FlowPresentation = FlowSpec & { alt: string; imageWidth?: number; imageHeight?: number };

export type ParsedMarkdown = {
  markdown: string;
  headings: ArticleHeading[];
  description: string;
  sourceOrigin?: SourceOrigin;
  flow: null | { paragraphs: string[]; hardLines?: string[][]; source?: FlowSourceMap; spec: FlowPresentation };
};

function isPlainParagraph(node: Paragraph) {
  return node.children.every((child) => child.type === 'text' || child.type === 'break');
}

function paragraphDescription(node: Paragraph) {
  return node.children.map((child) => child.type === 'text' && child.data?.sachiIndent
    ? child.value.slice(firstLineIndent.length).trimStart() : toString(child)).join('');
}

/** Keep explicit breaks separate from soft source newlines, which remain ordinary text. */
function flowLines(node: Paragraph) {
  const lines = [''];
  const indented = [false];
  for (const child of node.children) {
    if (child.type === 'break') { lines.push(''); indented.push(false); }
    else if (child.type === 'text') {
      const index = lines.length - 1;
      lines[index] += child.value;
      if (child.data?.sachiIndent) indented[index] = true;
    }
  }
  return lines.map((line, index) => indented[index] ? `${firstLineIndent}${line.trim()}` : line.trim());
}

function flowSource(node: Paragraph, chunks: string[], bodyLines: string[], origin: SourceOrigin, mapper: ReturnType<typeof createSourceMapper>): SourceLine[][] {
  const mapped: SourceTextMap[][] = [[]];
  for (const child of node.children) {
    if (child.type === 'break') mapped.push([]);
    else if (child.type === 'text') mapped.at(-1)!.push(mapper.leaf(child));
  }
  const starts = [node.position!.start];
  for (const child of node.children) if (child.type === 'break') starts.push(child.position!.end);
  return chunks.map((chunk, index) => {
    const map = trimSourceMap(joinSourceMaps(mapped[index]));
    const precise = map.text === chunk && map.points.length === chunk.length + 1;
    const normalized = normalizeFlowText(chunk);
    let scan = 0;
    let textOffset = 0;
    return chunk.split('\n').map((text, softIndex) => {
      const clean = normalizeFlowText(text);
      const offset = clean ? Math.max(scan, normalized.indexOf(clean, scan)) : scan;
      scan = offset + clean.length;
      const line = starts[index].line + softIndex;
      const column = softIndex === 0 ? starts[index].column : 1;
      const endColumn = line === node.position!.end.line ? node.position!.end.column : (bodyLines[line - 1]?.length ?? text.length) + 1;
      const range = sourceRange({ start: { line, column }, end: { line, column: endColumn } }, origin)!;
      const points = precise ? map.points.slice(textOffset, textOffset + text.length + 1) : undefined;
      textOffset += text.length + 1;
      return { range, text, offset, endOffset: scan, ...(points ? { points } : {}) };
    });
  });
}

export function parseMarkdown(body: string, flowSpec?: FlowSpec, assets: Record<string, Asset> = {}, origin?: SourceOrigin): ParsedMarkdown {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFirstLineIndent);
  const tree = processor.runSync(processor.parse(body), body) as Root;
  const headings = analyzeArticleStructure(tree);

  const description = tree.children
    .filter((node): node is Paragraph => node.type === 'paragraph')
    .map(paragraphDescription)
    .find(Boolean)
    ?.slice(0, 140) ?? '';

  if (!flowSpec) return { markdown: body, headings, description, flow: null, ...(origin ? { sourceOrigin: origin } : {}) };

  const boundaryIndex = tree.children.findIndex(
    (node) => node.type === 'heading' && node.depth === 2,
  );
  if (boundaryIndex < 0) throw new Error('启用图文环绕的文章必须至少包含一个二级标题。');

  const introNodes = tree.children.slice(0, boundaryIndex);
  const paragraphs: string[] = [];
  const hardLines: string[][] = [];
  let hasHardBreak = false;
  let imageCount = 0;
  let imageAlt = '';
  const source: FlowSourceMap | undefined = origin ? { paragraphs: [], image: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } } : undefined;
  const bodyLines = origin ? body.split('\n') : [];
  const mapper = origin ? createSourceMapper(body, origin) : undefined;
  for (const node of introNodes) {
    if (node.type !== 'paragraph') {
      throw new Error('图文环绕区域仅支持纯文本段落和一张独立图片。');
    }
    if (node.children.length === 1 && node.children[0]?.type === 'image') {
      const normalize = (url: string) => decodeURIComponent(assets[url]?.url ?? url).replace(/^\.\//, '/');
      if (normalize(node.children[0].url) !== normalize(flowSpec.image)) throw new Error('环绕区域的图片必须与 flow.image 一致。');
      imageCount += 1;
      imageAlt = node.children[0].alt ?? '';
      if (source) source.image = sourceRange(node.position, origin!)!;
      continue;
    }
    if (!isPlainParagraph(node)) {
      throw new Error('图文环绕段落不能包含链接、强调、代码或其他富文本。');
    }
    const lines = flowLines(node);
    const text = lines.join('\n');
    if (text.trim()) {
      paragraphs.push(text);
      hardLines.push(lines);
      if (source) source.paragraphs.push(flowSource(node, lines, bodyLines, origin!, mapper!));
      if (lines.length > 1) hasHardBreak = true;
    }
  }
  if (imageCount !== 1 || paragraphs.length === 0) {
    throw new Error('图文环绕区域必须包含至少一个段落和一张独立图片。');
  }

  const boundary = tree.children[boundaryIndex];
  const offset = boundary?.position?.start.offset;
  if (offset === undefined) throw new Error('无法确定图文环绕区域的 Markdown 边界。');
  const imageAsset = assets[flowSpec.image] ?? Object.values(assets).find((asset) => asset.url === flowSpec.image);

  return {
    markdown: body.slice(offset).trim(),
    headings,
    description,
    ...(origin ? { sourceOrigin: { lineOffset: origin.lineOffset + boundary.position!.start.line - 1 } } : {}),
    flow: { paragraphs, ...(hasHardBreak ? { hardLines } : {}), ...(source ? { source } : {}), spec: {
      ...flowSpec, alt: flowSpec.alt ?? imageAlt,
      imageWidth: imageAsset?.width, imageHeight: imageAsset?.height,
    } },
  };
}
