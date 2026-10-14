import type { Break, Paragraph, PhrasingContent, Root, Text } from 'mdast';
import type { Position } from 'unist';
import { createSourceMapper } from './source-text-map';

/** Source newlines in top-level verses become real breaks, without rewriting Markdown. */
export function remarkPoetry({ enabled = false }: { enabled?: boolean } = {}) {
  return (tree: Root, file: { toString(): string }) => {
    if (!enabled) return;
    const source = file.toString();
    const mapper = createSourceMapper(source, { lineOffset: 0 });
    const starts = [0, ...[...source.matchAll(/\r\n|\n|\r/g)].map((match) => match.index + match[0].length)];
    function split(node: Text): Array<Text | Break> {
      if (!node.value.includes('\n') && !node.value.includes('\r')) return [node];
      const map = mapper.leaf(node);
      const point = (index: number) => {
        const value = map.points[index];
        return { ...value, offset: starts[value.line - 1] + value.column - 1 };
      };
      const position = (start: number, end: number): Position => ({ start: point(start), end: point(end) });
      const children: Array<Text | Break> = [];
      let start = 0;
      for (const match of node.value.matchAll(/\r\n|\n|\r/g)) {
        const end = match.index + match[0].length;
        // An encoded &#10; is text, not a source line boundary.
        if (map.points[end].line === map.points[match.index].line) continue;
        if (start < match.index) children.push({ ...node, value: node.value.slice(start, match.index), position: position(start, match.index) });
        children.push({ type: 'break', position: position(match.index, end) });
        start = end;
      }
      if (!children.length) return [node];
      if (start < node.value.length) children.push({ ...node, value: node.value.slice(start), position: position(start, node.value.length) });
      return children;
    }
    function lines(children: PhrasingContent[]): PhrasingContent[] {
      return children.flatMap<PhrasingContent>((node) => {
        if (node.type === 'text') return split(node);
        if (node.type === 'emphasis' || node.type === 'strong' || node.type === 'delete' || node.type === 'link' || node.type === 'linkReference') node.children = lines(node.children);
        return [node];
      });
    }
    function hasImage(children: PhrasingContent[]): boolean {
      return children.some((node) => node.type === 'image' || node.type === 'imageReference' || 'children' in node && hasImage(node.children));
    }
    for (const node of tree.children) {
      if (node.type !== 'paragraph' || hasImage(node.children)) continue;
      const stanza: Paragraph = node;
      stanza.children = lines(stanza.children);
      stanza.data = { ...stanza.data, hProperties: { ...stanza.data?.hProperties, 'data-poem-stanza': true } };
    }
  };
}
