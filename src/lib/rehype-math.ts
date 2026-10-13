import type { Element, Root } from 'hast';
import rehypeKatex from 'rehype-katex';
import { SKIP, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

const classes = (node: Element) => Array.isArray(node.properties.className) ? node.properties.className : [];

/** Render during Markdown processing, retaining a scroll container and preview source range. */
export function rehypeMath() {
  const render = rehypeKatex({ trust: false, errorColor: '#8a4136', maxSize: 20, maxExpand: 1000 });
  return (tree: Root, file: VFile) => {
    visit(tree, 'element', (node, index, parent) => {
      if (index === undefined || !parent) return;
      const mathCode = node.tagName === 'pre' ? node.children.find((child): child is Element => child.type === 'element' && child.tagName === 'code' && classes(child).includes('language-math')) : undefined;
      const block = !!mathCode;
      const inline = node.tagName === 'code' && classes(node).includes('math-inline');
      if (!block && !inline) return;
      // Rendered glyphs don't have a one-to-one TeX character mapping. Clicking
      // them uses the formula's source start instead of a misleading text map.
      const source = Object.fromEntries(Object.entries({ ...mathCode?.properties, ...node.properties }).filter(([key]) => key.startsWith('data-source-') && key !== 'data-source-map' && key !== 'data-source-content-line'));
      const wrapper: Element = {
        type: 'element', tagName: block ? 'div' : 'span', position: node.position,
        properties: { ...source, className: [block ? 'math-block' : 'math-inline-container'], ...(block ? { tabIndex: 0, ariaLabel: '可横向滚动的公式' } : {}) },
        children: [node],
      };
      parent.children[index] = wrapper;
      return SKIP;
    });
    render(tree, file);
  };
}
