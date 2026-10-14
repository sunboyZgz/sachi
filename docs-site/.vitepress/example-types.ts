import type { ArticleType, Asset } from '../../src/lib/blog/schema';
import type { ParsedMarkdown } from '../../src/lib/markdown';

export type BlogExampleInput = { markdown: string; type?: ArticleType; title?: string; assets: Record<string, Asset>; flow: ParsedMarkdown['flow']; flows: ParsedMarkdown['flows']; flowWidths: ParsedMarkdown['flowWidths']; cover?: { title: string; image: string; url: string } };
export type BlogExample = { id: string; title: string; source: string; input: BlogExampleInput; html: string; expectedHeight: number };
