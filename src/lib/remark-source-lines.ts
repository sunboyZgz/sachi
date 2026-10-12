import type { Root } from 'mdast';
import type { ElementContent } from 'hast';
import { visit } from 'unist-util-visit';
import { sourceAttributes, sourceRange, type SourceOrigin } from './source-lines';
import { createSourceMapper, sourceMapAttributes } from './source-text-map';

const blocks = new Set(['heading', 'paragraph', 'code', 'table', 'tableRow', 'listItem', 'blockquote']);

/** Opt-in source markers for editor previews; production HTML never enables this plugin. */
export function remarkSourceLines(origin: SourceOrigin) {
  return (tree: Root, file: { toString(): string }) => {
    const source = file.toString().split('\n');
    const mapper = createSourceMapper(file.toString(), origin);
    visit(tree, (node) => {
      const range = sourceRange(node.position, origin);
      if (!range) return;
      if (blocks.has(node.type)) {
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, ...sourceAttributes(range, node.type) } };
        if (node.type === 'code') {
          const opening = source[(node.position?.start.line ?? 1) - 1];
          node.data.hProperties!['data-source-content-line'] = range.start.line + (/^\s*(?:`{3,}|~{3,})/.test(opening) ? 1 : 0);
        }
      }
      if (node.type === 'code' || node.type === 'inlineCode') {
        const map = mapper.leaf(node);
        const points = node.type === 'code' ? [...map.points, map.points.at(-1)!] : map.points;
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, ...sourceAttributes(range, node.type === 'code' ? 'code' : 'text'), ...sourceMapAttributes(points) } };
      }
      if (node.type !== 'text') return;
      const map = mapper.leaf(node);
      const children: ElementContent[] = [];
      const parts = node.value.split('\n');
      let offset = 0;
      parts.forEach((value, index) => {
        const line = range.start.line + index;
        const startColumn = index === 0 ? range.start.column : 1;
        const endColumn = index === parts.length - 1 ? range.end.column : (source[(node.position?.start.line ?? 1) + index - 1]?.length ?? value.length) + 1;
        if (index) children.push({ type: 'text', value: '\n' });
        children.push({ type: 'element', tagName: 'span', properties: {
          ...sourceAttributes({ start: { line, column: startColumn }, end: { line, column: endColumn } }, 'text'),
          ...sourceMapAttributes(map.points.slice(offset, offset + value.length + 1)),
          'data-source-line': line,
        }, children: [{ type: 'text', value }] });
        offset += value.length + 1;
      });
      node.data = { ...node.data, hName: 'span', hChildren: children };
    });
  };
}
