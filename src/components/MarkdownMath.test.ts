import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from './MarkdownContent';
import { ArticleProse } from './ArticleProse';
import { parseMarkdown } from '../lib/markdown';
import { imageReferences, markdownReferences } from '../lib/blog/document';

const render = (markdown: string, preview = false) => renderToStaticMarkup(createElement(MarkdownContent, { markdown, ...(preview ? { sourceOrigin: { lineOffset: 8 } } : {}) }));

describe('shared math rendering', () => {
  it('renders inline, display and fenced math as server HTML and accessible MathML', () => {
    const html = render('正文 $E = mc^2$。\n\n$$\n\\frac{1}{2}\n$$\n\n```math\n\\sqrt{2}\n```');
    expect(html.match(/class="math-block"/g)).toHaveLength(2);
    expect(html).toContain('class="math-inline-container"');
    expect(html.match(/class="katex-mathml"/g)).toHaveLength(3);
    expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML"');
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac{1}{2}</annotation>');
    expect(html).toContain('aria-label="可横向滚动的公式"');
    expect(html).not.toContain('<pre>');
    expect(html).not.toContain('code-copy');
    expect(html).not.toContain('data-source');
  });

  it('keeps escaped dollars and code literal, and renders formulas nested in GFM', () => {
    const html = render('金额 \\$5 与 \\$10。`$x$`\n\n```js\nconst price = "$5";\n```\n\n> $x^2$\n\n| 公式 |\n| --- |\n| $\\sqrt{2}$ |');
    expect(html).toContain('金额 $5 与 $10。<code>$x$</code>');
    expect(html).toContain('class="language-js hljs"');
    expect(html).toContain('&quot;$5&quot;');
    expect(html.match(/class="katex-mathml"/g)).toHaveLength(2);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<table>');
  });

  it('preserves invalid TeX and following text, and prevents math from injecting markup', () => {
    const html = render('$$\n\\frac{1}{\n$$\n\n后续正文。\n\n$\\href{javascript:alert(1)}{x}$\n\n$\\includegraphics{https://example.org/a.png}$');
    expect(html).toContain('class="katex-error"');
    expect(html).toContain('\\frac{1}{</span>');
    expect(html).toContain('<p>后续正文。</p>');
    expect(html).not.toMatch(/<a(?:\s|>)/);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
  });

  it('keeps preview source ranges around formulas without applying a false character map', () => {
    const html = render('正文 $x^2$。\n\n$$\na+b\n$$\n\n```math\nx+y\n```', true);
    expect(html).toMatch(/<span data-source-start="9"[^>]*data-source-start-column="4"[^>]*class="math-inline-container"/);
    expect(html).toMatch(/<div data-source-start="11"[^>]*data-source-end="13"[^>]*class="math-block"/);
    expect(html).toMatch(/<div data-source-start="15"[^>]*data-source-end="17"[^>]*class="math-block"/);
    const wrappers = html.match(/<(?:div|span)[^>]*class="math-(?:block|inline-container)"[^>]*>/g)!;
    expect(wrappers).toHaveLength(3);
    for (const wrapper of wrappers) expect(wrapper).not.toContain('data-source-map');
  });

  it('keeps formula paragraphs out of plain-text flow and preserves headings after them', () => {
    const body = '纯文本。\n\n![图](./assets/shape.png)\n\n公式 $x^2$。\n\n$$\ny = x + 1\n$$\n\n## 后文';
    const parsed = parseMarkdown(body, { image: './assets/shape.png', defaultX: .53, defaultY: 20 });
    expect(parsed.flows).toHaveLength(1);
    expect(parsed.flows[0].paragraphs).toEqual(['纯文本。']);
    expect(parsed.markdown).toBe(body);
    const html = renderToStaticMarkup(createElement(ArticleProse, { parsed, assets: {}, flowKey: 'math-flow' }));
    expect(html).toContain('class="math-inline-container"');
    expect(html).toContain('class="math-block"');
    expect(html).toContain('id="后文"');
  });

  it('uses math-aware dependency scanning without treating TeX examples as resources or raw HTML', () => {
    const body = '$\\text{![图](./assets/fake.png) <tag>}$\n\n$$\n\\text{[附件](./assets/fake.pdf)}\n$$\n\n![真图](./assets/real.png)\n\n[真附件](./assets/real.pdf)';
    expect(markdownReferences(body)).toEqual(['./assets/real.pdf', './assets/real.png']);
    expect(imageReferences(body)).toEqual(['./assets/real.png']);
    expect(() => markdownReferences('<img src="./assets/real.png">')).toThrow('原始 HTML');
  });
});
