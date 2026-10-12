import type { Asset } from '../lib/blog/schema';
import type { ParsedMarkdown } from '../lib/markdown';
import { FlowParagraphs } from './FlowParagraphs';
import { MarkdownContent } from './MarkdownContent';

export function ArticleProse({ parsed, assets, flowKey }: { parsed: ParsedMarkdown; assets: Record<string, Asset>; flowKey: string }) {
  return <div className="article-prose">
    {parsed.flow ? <FlowParagraphs key={flowKey} paragraphs={parsed.flow.paragraphs} hardLines={parsed.flow.hardLines} source={parsed.flow.source} spec={parsed.flow.spec} /> : null}
    <MarkdownContent markdown={parsed.markdown} assets={assets} sourceOrigin={parsed.sourceOrigin} leadingFlow={!!parsed.flow} />
  </div>;
}
