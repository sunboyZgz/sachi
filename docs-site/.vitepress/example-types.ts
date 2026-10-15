import type { ArticleType, Asset } from '../../src/lib/blog/schema';
import type { ParsedMarkdown } from '../../src/lib/markdown';
import type { ImageWindows } from '../../src/lib/image-window';

export type BlogExampleInput = { markdown: string; type?: ArticleType; title?: string; imageWindows?: ImageWindows; assets: Record<string, Asset>; flow: ParsedMarkdown['flow']; flows: ParsedMarkdown['flows']; flowWidths: ParsedMarkdown['flowWidths']; cover?: { title: string; image: string; url: string } };
export type BlogExample = { id: string; title: string; source: string; input: BlogExampleInput; html: string; expectedHeight: number };
