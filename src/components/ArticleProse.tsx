import type { Asset } from '../lib/blog/schema';
import type { ParsedMarkdown } from '../lib/markdown';
import { MarkdownContent } from './MarkdownContent';

export function ArticleProse({ parsed, assets, flowKey, layoutMode }: { parsed: ParsedMarkdown; assets: Record<string, Asset>; flowKey: string; layoutMode?: 'responsive' | 'desktop' }) {
  return <div className={`article-prose${parsed.type === 'poem' ? ' article-prose--poem' : ''}`}>
    <MarkdownContent markdown={parsed.markdown} type={parsed.type} assets={assets} sourceOrigin={parsed.sourceOrigin} flows={parsed.flows} flowWidths={parsed.flowWidths} flowKey={flowKey} layoutMode={layoutMode} />
  </div>;
}
