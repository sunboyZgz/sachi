import { loadExamples } from '../../tools/docs/examples';
import type { BlogExample } from './example-types';

export declare const data: { examples: Record<string, BlogExample>; css: string };
const loader = {
  watch: ['./examples/*', '../../src/components/{MarkdownContent,CodeBlock,FlowParagraphs}.tsx', '../../src/styles/*.css'],
  load: () => loadExamples(process.env.DOCS_BASE ?? '/'),
};
export default loader;
