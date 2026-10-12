import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

declare module 'mdast' {
  interface ParagraphData {
    sachiIndent?: boolean;
  }
  interface TextData {
    sachiIndent?: boolean;
  }
}

export const firstLineIndent = '\u2003\u2003';

/** Expand :: at paragraph starts and after explicit Markdown hard breaks. */
export function remarkFirstLineIndent() {
  return (tree: Root, file: { toString(): string }) => {
    const source = file.toString();
    visit(tree, 'paragraph', (node) => {
      if (node.children.some((child) => child.type === 'image' || child.type === 'imageReference')) return;
      node.children.forEach((child, index) => {
        if (index !== 0 && node.children[index - 1].type !== 'break') return;
        if (child.type !== 'text' || !/^::(?!:)/.test(child.value)) return;
        const offset = child.position?.start.offset;
        // Escaped or entity-encoded colons have the same text value, but aren't our marker.
        if (offset === undefined || !/^::(?!:)/.test(source.slice(offset, offset + 3))) return;
        child.value = `${firstLineIndent}${child.value.slice(2).replace(/^[ \t]+/, '')}`;
        child.data = { ...child.data, sachiIndent: true };
        if (index === 0) node.data = { ...node.data, sachiIndent: true };
      });
    });
  };
}
