import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '@/lib/markdown';
import { MarkdownContent } from './MarkdownContent';

const render = (markdown: string) => renderToStaticMarkup(createElement(MarkdownContent, { markdown }));

describe('Markdown reading controls', () => {
  it('adds native, encoded permalinks to all six heading levels', () => {
    const html = render(Array.from({ length: 6 }, (_, index) => `${'#'.repeat(index + 1)} 中文标题 ${index + 1}`).join('\n\n'));
    for (let level = 1; level <= 6; level += 1) {
      expect(html).toContain(`<h${level} id="中文标题-${level}"`);
      expect(html).toContain(`href="#${encodeURIComponent(`中文标题-${level}`)}"`);
      expect(html).toContain(`aria-label="链接到标题：中文标题 ${level}"`);
    }
  });

  it('keeps duplicate and rich heading IDs aligned with the existing article contents', () => {
    const markdown = '## 重复 标题？\n\n第一段。\n\n## 重复 标题？\n\n## 用 **强调** 与 `代码` [阅读](https://example.org/)';
    const html = render(markdown);
    const headings = parseMarkdown(markdown).headings;
    expect(headings[1].id).toBe(`${headings[0].id}-1`);
    for (const heading of headings) {
      expect(html).toContain(`id="${heading.id}"`);
      expect(html).toContain(`href="#${encodeURIComponent(heading.id)}"`);
      expect(html).toContain(`aria-label="${heading.text}"`);
    }
    expect(html).toContain('<strong>强调</strong>');
    expect(html).toContain('<code>代码</code>');
    expect(html).toContain('<a href="https://example.org/">阅读</a>');
  });

  it('enhances only code blocks while retaining exact code, escaping and no-JS server output', () => {
    const html = render([
      '行内 `inline`。',
      '```ts\n  const value = "<tag>&";\n\n  console.log(value);\n```',
      '```\nplain\n```',
      '    indented\n    second',
    ].join('\n\n'));
    expect(html.match(/class="code-block"/g)).toHaveLength(3);
    expect(html.match(/class="code-copy"[^>]*hidden=""[^>]*disabled=""/g)).toHaveLength(3);
    expect(html).toContain('<code>inline</code>');
    expect(html).toContain('<pre><code class="language-ts">  const value = &quot;&lt;tag&gt;&amp;&quot;;\n\n  console.log(value);\n</code></pre>');
    expect(html).toContain('<pre><code>indented\nsecond\n</code></pre>');
    expect(html).not.toContain('<tag>');
  });
});
