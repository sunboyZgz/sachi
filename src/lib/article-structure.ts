import GithubSlugger from 'github-slugger';
import type { Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';

export type ArticleHeading = {
  id: string;
  text: string;
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  number: string;
  nesting: number;
  parentId?: string;
};

type StructureOptions = { leadingFlow?: boolean };

/** Derived presentation data only: never changes Markdown or the published snapshot. */
export function analyzeArticleStructure(tree: Root, { leadingFlow = false }: StructureOptions = {}): ArticleHeading[] {
  const slugger = new GithubSlugger();
  // Quoted and nested headings also consume duplicate suffixes. Image alt is not
  // heading text in the previous HTML slugger, so keep it out of anchor IDs.
  visit(tree, 'heading', (node) => {
    node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: slugger.slug(toString(node, { includeImageAlt: false, includeHtml: false })) } };
  });

  const headings: ArticleHeading[] = [];
  const ancestors: Array<{ heading: ArticleHeading; children: number }> = [];
  let chapters = 0;
  // Reference definitions have no body box and must not create visual spacing.
  const blocks = tree.children.filter((node) => node.type !== 'definition' && node.type !== 'footnoteDefinition');
  blocks.forEach((node, index) => {
    if (node.type !== 'heading') return;
    const previous = blocks[index - 1];
    const next = blocks[index + 1];
    node.data!.hProperties = {
      ...node.data!.hProperties,
      'data-heading-context': !previous && !leadingFlow ? 'opening' : previous?.type === 'heading' ? 'stacked' : 'section',
      ...(next?.type === 'heading' ? { 'data-heading-next': 'heading' } : {}),
    };
    const text = toString(node);
    if (!text.trim()) return;
    while (ancestors.length && ancestors.at(-1)!.heading.depth >= node.depth) ancestors.pop();
    const parent = ancestors.at(-1);
    const ordinal = parent ? ++parent.children : ++chapters;
    const heading: ArticleHeading = {
      id: String(node.data!.hProperties!.id), text, depth: node.depth,
      number: parent ? `${parent.heading.number}.${ordinal}` : String(ordinal).padStart(2, '0'),
      nesting: parent ? parent.heading.nesting + 1 : 0,
      ...(parent ? { parentId: parent.heading.id } : {}),
    };
    headings.push(heading);
    ancestors.push({ heading, children: 0 });
  });
  return headings;
}

export function remarkArticleStructure(options: StructureOptions = {}) {
  return (tree: Root) => { analyzeArticleStructure(tree, options); };
}
