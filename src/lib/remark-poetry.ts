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
        if (node.type === 'emphasis' || node.type === 'strong' || node.type === 'delete' || node.type === 'textSize' || node.type === 'link' || node.type === 'linkReference') node.children = lines(node.children);
        return [node];
      });
    }
    type Part = { media: boolean; children: PhrasingContent[] };
    function parts(children: PhrasingContent[]): Part[] {
      const result: Part[] = [];
      const append = (part: Part) => {
        if (!part.media && result.at(-1)?.media === false) result.at(-1)!.children.push(...part.children);
        else result.push(part);
      };
      for (const node of children) {
        if (node.type === 'image' || node.type === 'imageReference') append({ media: true, children: [node] });
        else if ('children' in node) {
          for (const part of parts(node.children)) {
            // Links may wrap a block image; text emphasis must not wrap a figure.
            const wrapped = !part.media || node.type === 'link' || node.type === 'linkReference';
            append({ media: part.media, children: wrapped ? [{ ...node, children: part.children, position: {
              start: part.children[0]?.position?.start ?? node.position!.start,
              end: part.children.at(-1)?.position?.end ?? node.position!.end,
            } } as PhrasingContent] : part.children });
          }
        } else append({ media: false, children: [node] });
      }
      return result;
    }
    function trimEdges(children: PhrasingContent[]): PhrasingContent[] {
      const result = [...children];
      for (const edge of ['start', 'end'] as const) {
        while (result.length) {
          const index = edge === 'start' ? 0 : result.length - 1;
          const node = result[index];
          if ('children' in node) {
            const inner = trimEdges(node.children);
            if (inner.length) { result[index] = { ...node, children: inner } as PhrasingContent; break; }
          } else if (node.type !== 'break' && (node.type !== 'text' || node.value.trim())) break;
          result.splice(index, 1);
        }
      }
      return result;
    }
    tree.children = tree.children.flatMap<Root['children'][number]>((node) => {
      if (node.type !== 'paragraph') return [node];
      const sections = parts(lines(node.children));
      return sections.flatMap((part): Paragraph[] => {
        const children = part.media ? part.children : sections.some((section) => section.media) ? trimEdges(part.children) : part.children;
        if (!children.length) return [];
        return [{ ...node, children, position: { start: children[0].position!.start, end: children.at(-1)!.position!.end },
          data: { ...node.data, hProperties: { ...node.data?.hProperties, [part.media ? 'data-poem-media' : 'data-poem-stanza']: true } } }];
      });
    });
  };
}
