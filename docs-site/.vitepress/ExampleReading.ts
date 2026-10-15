import { createElement } from 'react';
import { MarkdownContent } from '../../src/components/MarkdownContent';
import type { BlogExampleInput } from './example-types';

/** The real blog renderer, with synthetic documentation data and no site profile. */
export function ExampleReading({ input }: { input: BlogExampleInput }) {
  if (input.type === 'poem') return createElement('div', { className: 'article-main', 'data-article-type': 'poem' },
    createElement('h1', { className: 'article-title' }, input.title),
    createElement('div', { className: 'article-intro-rule', 'aria-hidden': true }),
    createElement('div', { className: 'article-prose article-prose--poem' }, createElement(MarkdownContent, { markdown: input.markdown, type: input.type, imageWindows: input.imageWindows, assets: input.assets, basePath: '' })),
  );
  if (input.cover) return createElement('section', { className: 'directory-column', 'aria-label': '栏目重点条目示意' },
    createElement('p', { className: 'entry-kind' }, '生活旁白 · 栏目重点条目示意'),
    createElement('div', { className: 'featured-entry' },
      createElement('a', { href: input.cover.url }, createElement('span', { className: 'entry-kind' }, '精选'), createElement('h3', null, input.cover.title)),
      createElement('img', { src: input.cover.image, alt: '文章封面', width: 112, height: 98 }),
    ),
    createElement('p', { className: 'entry-kind' }, '条目采用文章封面，正文没有因此自动增加图片。'),
  );
  return createElement(MarkdownContent, { markdown: input.markdown, imageWindows: input.imageWindows, assets: input.assets, basePath: '', flows: input.flows, flowWidths: input.flowWidths });
}
