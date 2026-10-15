import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { windowForImage, type ImageWindows } from './image-window';

/** Keep author references separate from display URLs, including reference-style images. */
export function remarkImageWindows(windows?: ImageWindows) {
  return (tree: Root) => {
    const definitions = new Map(tree.children.filter((node) => node.type === 'definition').map((node) => [node.identifier.toUpperCase(), node]));
    visit(tree, (node, _index, parent) => {
      if (node.type !== 'image' && node.type !== 'imageReference') return;
      const reference = node.type === 'image' ? node.url : definitions.get(node.identifier.toUpperCase())?.url;
      if (!reference) return;
      const window = windowForImage(windows, reference);
      let link: string | undefined;
      if ((parent?.type === 'link' || parent?.type === 'linkReference') && parent.children.length === 1) {
        link = parent.type === 'link' ? parent.url : definitions.get(parent.identifier.toUpperCase())?.url;
        if (link) parent.data = { ...parent.data, hName: 'div', hProperties: { ...parent.data?.hProperties, href: undefined } };
      }
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, 'data-image-reference': reference, ...(link ? { 'data-image-link': link } : {}), ...(window ? { 'data-image-window': JSON.stringify(window) } : {}) } };
    });
  };
}
