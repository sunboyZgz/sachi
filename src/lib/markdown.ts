import type { Paragraph, Root, Image, ImageReference } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { analyzeArticleStructure, type ArticleHeading } from './article-structure';
import { flowSpecs, type Asset, type FlowSpec, type FlowConfig } from './blog/schema';
import { visit } from 'unist-util-visit';
import { firstLineIndent, remarkFirstLineIndent } from './remark-first-line-indent';
import { normalizeFlowText, sourceRange, type FlowSourceMap, type SourceLine, type SourceOrigin } from './source-lines';
import { createSourceMapper, joinSourceMaps, trimSourceMap, type SourceTextMap } from './source-text-map';

export type { ArticleHeading } from './article-structure';
export type FlowPresentation = FlowSpec & { alt: string; imageWidth?: number; imageHeight?: number };

export type FlowRegion = {
  id: string; start: number; end: number; imageIndex: number;
  paragraphs: string[]; hardLines?: string[][]; source?: FlowSourceMap; spec: FlowPresentation;
};
export type ParsedMarkdown = {
  markdown: string;
  headings: ArticleHeading[];
  description: string;
  sourceOrigin?: SourceOrigin;
  flows: FlowRegion[];
  flow: FlowRegion | null;
  flowWidths: Record<string, number>;
  warnings: string[];
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

/** Author references are matched before display URL mapping (hash-identical assets stay distinct). */
export function flowResource(url: string) {
  try { return decodeURIComponent(url).replace(/^\.\//, '/'); } catch { return url; }
}
export function imageResolver(tree: Root) {
  const definitions = new Map(tree.children.filter((node) => node.type === 'definition').map((node) => [node.identifier.toUpperCase(), node.url]));
  return (node: Image | ImageReference) => node.type === 'image' ? node.url : definitions.get(node.identifier.toUpperCase());
}

export function parseMarkdown(body: string, config?: FlowConfig, assets: Record<string, Asset> = {}, origin?: SourceOrigin, options: { tolerant?: boolean } = {}): ParsedMarkdown {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFirstLineIndent);
  const tree = processor.runSync(processor.parse(body), body) as Root;
  const headings = analyzeArticleStructure(tree);
  const description = tree.children.filter((node): node is Paragraph => node.type === 'paragraph').map(paragraphDescription).find(Boolean)?.slice(0, 140) ?? '';
  const flows: FlowRegion[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const specs = new Map<string, FlowSpec>();
  const invalid = new Set<string>();
  const flowWidths: Record<string, number> = {};
  const atLine = (line?: number) => line === undefined ? '?' : line + (origin?.lineOffset ?? 0);
  const issue = (message: string) => { errors.push(message); warnings.push(`环绕暂用普通排版：${message}`); };
  flowSpecs(config).forEach((spec, index) => {
    const key = flowResource(spec.image);
    if (specs.has(key)) { invalid.add(key); issue(`flow[${index + 1}] 配置重复：${spec.image}`); }
    else specs.set(key, spec);
    flowWidths[key] = spec.width ?? 205;
  });
  const resolveImage = imageResolver(tree);
  const keyFor = (node: Image | ImageReference) => flowResource(resolveImage(node) ?? '');
  // Old mapped inputs are accepted when unambiguous; new pipelines keep original references.
  for (const [key, spec] of [...specs]) {
    if (Object.values(assets).some((asset) => flowResource(asset.url) === key)) {
      const matches = Object.entries(assets).filter(([, asset]) => flowResource(asset.url) === key);
      if (matches.length === 1) { specs.set(flowResource(matches[0][0]), spec); flowWidths[flowResource(matches[0][0])] = spec.width ?? 205; }
    }
  }
  const occurrences = new Map<string, number>();
  const seen = new Set<FlowSpec>();
  visit(tree, (node, _index, parent) => {
    if (node.type !== 'image' && node.type !== 'imageReference') return;
    const key = keyFor(node), spec = specs.get(key);
    if (!spec) return;
    seen.add(spec);
    const top = parent?.type === 'paragraph' && tree.children.includes(parent) && parent.children.length === 1;
    if (!top) issue(`第 ${atLine(node.position?.start.line)} 行：${spec.image} 不是独立的正文图片段落。请把图片语句放在正文顶层，前后各空一行；嵌套或富文本图片保留普通 Markdown。`);
  });
  for (const spec of new Set(specs.values())) if (!seen.has(spec)) issue(`flow.image 未出现在正文：${spec.image}。flow 只配置排版，请在正文添加 ![图片](${spec.image})，前后各空一行。`);
  const bodyLines = body.split('\n');
  const mapper = origin ? createSourceMapper(body, origin) : undefined;
  const eligible = (node: Root['children'][number]) => node.type === 'definition' || node.type === 'paragraph' && (isPlainParagraph(node) || node.children.length === 1 && (node.children[0].type === 'image' || node.children[0].type === 'imageReference') && specs.has(keyFor(node.children[0])));
  for (let start = 0; start < tree.children.length;) {
    if (!eligible(tree.children[start])) { start++; continue; }
    let end = start;
    while (end < tree.children.length && eligible(tree.children[end])) end++;
    const nodes = tree.children.slice(start, end);
    const images = nodes.filter((node): node is Paragraph => node.type === 'paragraph' && node.children.length === 1 && (node.children[0].type === 'image' || node.children[0].type === 'imageReference'));
    if (images.length > 1) issue(`第 ${atLine(images[0].position?.start.line)}–${atLine(images.at(-1)!.position?.start.line)} 行：同一连续区域含多张配置图片，请用任意标题、分隔线或其他普通块分隔。`);
    else if (images.length === 1) {
      const imageNode = images[0].children[0] as Image | ImageReference;
      const key = keyFor(imageNode), spec = specs.get(key)!;
      const textNodes = nodes.filter((node): node is Paragraph => node.type === 'paragraph' && isPlainParagraph(node));
      if (!textNodes.length) warnings.push(`第 ${atLine(imageNode.position?.start.line)} 行：${spec.image} 附近没有连续纯文本，按配置宽度普通展示。`);
      else if (!invalid.has(key)) {
        const hardLines = textNodes.map(flowLines);
        const imageAsset = assets[spec.image] ?? assets[resolveImage(imageNode)!];
        const occurrence = (occurrences.get(key) ?? 0) + 1;
        occurrences.set(key, occurrence);
        flows.push({ id: `${key}:${occurrence}`, start, end, imageIndex: nodes.slice(0, nodes.indexOf(images[0])).filter((node) => node.type === 'paragraph').length,
          paragraphs: hardLines.map((lines) => lines.join('\n')),
          ...(hardLines.some((lines) => lines.length > 1) ? { hardLines } : {}),
          ...(origin ? { source: { paragraphs: textNodes.map((node, index) => flowSource(node, hardLines[index], bodyLines, origin, mapper!)), image: sourceRange(imageNode.position, origin)! } } : {}),
          spec: { ...spec, image: imageAsset?.url ?? spec.image, contour: spec.contour ? assets[spec.contour]?.url ?? spec.contour : imageAsset?.contour,
            alt: spec.alt ?? imageNode.alt ?? '', imageWidth: imageAsset?.width, imageHeight: imageAsset?.height },
        });
      }
    }
    start = end;
  }
  if (errors.length && !options.tolerant) throw new Error(errors.join('\n'));
  return { markdown: body, headings, description, flows, flow: flows[0] ?? null, flowWidths, warnings, ...(origin ? { sourceOrigin: origin } : {}) };
}

/** Replace only recognized blocks after full-tree heading and source analysis. */
export function remarkFlowRegions({ flows, widths }: { flows: FlowRegion[]; widths: Record<string, number> }) {
  return (tree: Root) => {
    const resolve = imageResolver(tree);
    visit(tree, (node) => {
      if (node.type !== 'image' && node.type !== 'imageReference') return;
      const width = widths[flowResource(resolve(node) ?? '')];
      if (width) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, 'data-flow-width': width } };
    });
    for (const region of [...flows].reverse()) tree.children.splice(region.start, region.end - region.start, {
      type: 'blockquote', children: tree.children.slice(region.start, region.end).filter((node) => node.type === 'definition'), data: { hName: 'div', hProperties: { 'data-flow-id': region.id } },
    });
  };
}
