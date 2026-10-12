import type { Root } from 'hast';
import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';

// Register once, using only these grammars. HTML is an alias of the XML grammar.
const highlighter = createLowlight({ javascript, typescript, python, bash, json, yaml, xml, css, java, go, rust });

/** Shared by the static blog and editor preview; never guesses a language. */
export function rehypeCodeHighlight() {
  return (tree: Root) => {
    visit(tree, 'element', (node, _index, parent) => {
      if (node.tagName !== 'code' || parent?.type !== 'element' || parent.tagName !== 'pre') return;
      const classes = Array.isArray(node.properties.className) ? node.properties.className.map(String) : String(node.properties.className ?? '').split(/\s+/).filter(Boolean);
      if (classes.includes('hljs')) return;
      const language = classes.find((name) => name.startsWith('language-'))?.slice(9).toLowerCase();
      if (!language || !highlighter.registered(language)) return;
      const value = toString(node);
      try {
        const highlighted = highlighter.highlight(language, value);
        // A failed or lossy grammar must leave the original code and source markers intact.
        if (toString(highlighted) !== value) return;
        node.children = highlighted.children.filter((child) => child.type !== 'doctype');
        node.properties.className = [...classes, 'hljs'];
      } catch { /* Keep the complete plain-text DOM when highlighting is unavailable. */ }
    });
  };
}
