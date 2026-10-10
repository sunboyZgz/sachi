import GithubSlugger from 'github-slugger';
import type { Heading, Paragraph, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { Asset, FlowSpec } from './blog/schema';

export type ArticleHeading = { id: string; text: string };
export type FlowPresentation = FlowSpec & { alt: string; imageWidth?: number; imageHeight?: number };

export type ParsedMarkdown = {
  markdown: string;
  headings: ArticleHeading[];
  description: string;
  flow: null | { paragraphs: string[]; spec: FlowPresentation };
};

function isPlainParagraph(node: Paragraph) {
  return node.children.every((child) => child.type === 'text' || child.type === 'break');
}

export function parseMarkdown(body: string, flowSpec?: FlowSpec, assets: Record<string, Asset> = {}): ParsedMarkdown {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const slugger = new GithubSlugger();
  const headings: ArticleHeading[] = [];
  visit(tree, 'heading', (node: Heading) => {
    const text = toString(node);
    const id = slugger.slug(text);
    if (node.depth === 2) headings.push({ id, text });
  });

  const description = tree.children
    .filter((node): node is Paragraph => node.type === 'paragraph')
    .map((node) => toString(node))
    .find(Boolean)
    ?.slice(0, 140) ?? '';

  if (!flowSpec) return { markdown: body, headings, description, flow: null };

  const boundaryIndex = tree.children.findIndex(
    (node) => node.type === 'heading' && node.depth === 2,
  );
  if (boundaryIndex < 0) throw new Error('启用图文环绕的文章必须至少包含一个二级标题。');

  const introNodes = tree.children.slice(0, boundaryIndex);
  const paragraphs: string[] = [];
  let imageCount = 0;
  let imageAlt = '';
  for (const node of introNodes) {
    if (node.type !== 'paragraph') {
      throw new Error('图文环绕区域仅支持纯文本段落和一张独立图片。');
    }
    if (node.children.length === 1 && node.children[0]?.type === 'image') {
      const normalize = (url: string) => decodeURIComponent(assets[url]?.url ?? url).replace(/^\.\//, '/');
      if (normalize(node.children[0].url) !== normalize(flowSpec.image)) throw new Error('环绕区域的图片必须与 flow.image 一致。');
      imageCount += 1;
      imageAlt = node.children[0].alt ?? '';
      continue;
    }
    if (!isPlainParagraph(node)) {
      throw new Error('图文环绕段落不能包含链接、强调、代码或其他富文本。');
    }
    const text = toString(node).trim();
    if (text) paragraphs.push(text);
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
    flow: { paragraphs, spec: {
      ...flowSpec, alt: flowSpec.alt ?? imageAlt,
      imageWidth: imageAsset?.width, imageHeight: imageAsset?.height,
    } },
  };
}
