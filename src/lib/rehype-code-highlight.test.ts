import type { Element, Root } from 'hast';
import { toString } from 'mdast-util-to-string';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rehypeCodeHighlight } from './rehype-code-highlight';

const failure = vi.hoisted(() => ({ mode: '' }));
vi.mock('lowlight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lowlight')>();
  return { ...actual, createLowlight: (...args: Parameters<typeof actual.createLowlight>) => {
    const engine = actual.createLowlight(...args);
    const highlight = engine.highlight;
    engine.highlight = (...parameters) => {
      if (failure.mode === 'throw') throw new Error('Grammar unavailable');
      if (failure.mode === 'lossy') return { type: 'root', children: [] };
      return highlight(...parameters);
    };
    return engine;
  } };
});
afterEach(() => { failure.mode = ''; });

function block(language: string | undefined, value: string) {
  const code: Element = { type: 'element', tagName: 'code', properties: language ? { className: [`language-${language}`] } : {}, children: [{ type: 'text', value }] };
  const tree: Root = { type: 'root', children: [{ type: 'element', tagName: 'pre', properties: {}, children: [code] }] };
  return { tree, code };
}

const samples = [
  ['javascript', 'const value = "中文";\nconsole.log(value);\n'],
  ['typescript', 'const value: number = 1;\n'],
  ['python', 'def greet(name):\n    return "hello " + name\n'],
  ['bash', '# run locally\necho "$HOME"\n'],
  ['json', '{"value": true, "count": 1}\n'],
  ['yaml', 'title: "中文"\ncount: 1\n'],
  ['html', '<div class="note">中文 &amp; text</div>\n'],
  ['css', '.note { color: red; width: 12px; }\n'],
  ['java', 'public class Note { int count = 1; }\n'],
  ['go', 'package main\nfunc main() { println("hello") }\n'],
  ['rust', 'fn main() { let count = 1; println!("{}", count); }\n'],
] as const;

describe('shared code highlighting', () => {
  it('keeps every palette color above 4.5:1 against the actual code background', async () => {
    const theme = await readFile(new URL('../styles/code-highlight.css', import.meta.url), 'utf8');
    const site = await readFile(new URL('../styles/site.css', import.meta.url), 'utf8');
    const tokens = await readFile(new URL('../styles/tokens.css', import.meta.url), 'utf8');
    const background = site.match(/\.article-prose pre \{[^}]*background: (#[\da-f]{6})/i)![1];
    const body = tokens.match(/--article-body-color: (#[\da-f]{6})/i)![1];
    function luminance(hex: string) {
      const [red, green, blue] = hex.slice(1).match(/../g)!.map((part) => parseInt(part, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    }
    const colors = new Set([body, ...[...theme.matchAll(/color: (#[\da-f]{6})/gi)].map((match) => match[1])]);
    expect(colors.size).toBeGreaterThan(1);
    for (const color of colors) expect((luminance(background) + 0.05) / (luminance(color) + 0.05), color).toBeGreaterThanOrEqual(4.5);
  });

  it.each(samples)('highlights %s and retains every character', (language, value) => {
    const { tree, code } = block(language, value);
    rehypeCodeHighlight()(tree);
    expect(code.properties.className).toContain('hljs');
    expect(code.children.some((node) => node.type === 'element' && node.tagName === 'span')).toBe(true);
    expect(toString(code)).toBe(value);
  });

  it.each(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'sh', 'yml', 'xml', 'golang', 'rs', 'JS', 'TS'])('supports the %s language alias', (language) => {
    const { tree, code } = block(language, 'const value = 1;\n');
    rehypeCodeHighlight()(tree);
    expect(code.properties.className).toContain('hljs');
  });

  it.each([undefined, 'text', 'plaintext', 'txt', 'unknown', 'sql'])('leaves %s as plain text without guessing a language', (language) => {
    const { tree, code } = block(language, 'const note = "理解工具解决的问题";\n');
    const before = structuredClone(tree);
    rehypeCodeHighlight()(tree);
    expect(tree).toEqual(before);
    expect(code.children).toHaveLength(1);
  });

  it('keeps whitespace, HTML-like text, emoji, source positions and repeated rendering intact', () => {
    const value = '  const value = "<script>& 👨‍👩‍👧‍👦 é";\n\n\tconsole.log(value);\n\n';
    const { tree, code } = block('ts', value);
    code.properties['data-source-content-line'] = 19;
    code.properties['data-source-kind'] = 'code';
    code.position = { start: { line: 18, column: 1 }, end: { line: 24, column: 4 } };
    const position = structuredClone(code.position);
    rehypeCodeHighlight()(tree);
    expect(toString(code)).toBe(value);
    expect(code.position).toEqual(position);
    expect(code.properties['data-source-content-line']).toBe(19);
    expect(code.properties['data-source-kind']).toBe('code');
    const highlighted = structuredClone(tree);
    rehypeCodeHighlight()(tree);
    expect(tree).toEqual(highlighted);
  });

  it('does not highlight inline code even if it has a language class', () => {
    const { code } = block('js', 'const inline = 1;');
    const tree: Root = { type: 'root', children: [{ type: 'element', tagName: 'p', properties: {}, children: [code] }] };
    const before = structuredClone(tree);
    rehypeCodeHighlight()(tree);
    expect(tree).toEqual(before);
  });

  it.each(['throw', 'lossy'])('retains the entire original node when a grammar is %s', (mode) => {
    const { tree } = block('js', '  const value = "中文";\n\n');
    const before = structuredClone(tree);
    failure.mode = mode;
    expect(() => rehypeCodeHighlight()(tree)).not.toThrow();
    expect(tree).toEqual(before);
  });
});
