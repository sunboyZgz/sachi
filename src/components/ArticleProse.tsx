import type { Asset } from '../lib/blog/schema';
import type { ParsedMarkdown } from '../lib/markdown';
import { MarkdownContent } from './MarkdownContent';
import type { ImageEditor } from '../lib/image-window';

export function ArticleProse({ parsed, assets, flowKey, layoutMode, imageEditor }: { parsed: ParsedMarkdown; assets: Record<string, Asset>; flowKey: string; layoutMode?: 'responsive' | 'desktop'; imageEditor?: ImageEditor }) {
  return <div className={`article-prose${parsed.type === 'poem' ? ' article-prose--poem' : ''}`}>
    <MarkdownContent markdown={parsed.markdown} type={parsed.type} imageWindows={parsed.imageWindows} imageEditor={imageEditor} assets={assets} sourceOrigin={parsed.sourceOrigin} flows={parsed.flows} flowWidths={parsed.flowWidths} flowKey={flowKey} layoutMode={layoutMode} />
  </div>;
}
