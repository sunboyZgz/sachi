import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { defaultUrlTransform, type ExtraProps } from 'react-markdown';
import { visit } from 'unist-util-visit';
import type { Root } from 'hast';
import { toString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { remarkArticleStructure } from '../lib/article-structure';
import type { ArticleType, Asset } from '../lib/blog/schema';
import { remarkPoetry } from '../lib/remark-poetry';
import { remarkTextSize } from '../lib/remark-text-size';
import { withBasePath } from '../lib/site-path';
import { remarkFirstLineIndent } from '../lib/remark-first-line-indent';
import { remarkSourceLines } from '../lib/remark-source-lines';
import { rehypeCodeHighlight } from '../lib/rehype-code-highlight';
import { rehypeMath } from '../lib/rehype-math';
import { sourceAttributes, sourceRange, type SourceAttributes, type SourceOrigin, type SourceRange } from '../lib/source-lines';
import { CodeBlock } from './CodeBlock';
import { FlowParagraphs } from './FlowParagraphs';
import { remarkFlowRegions, type FlowRegion } from '../lib/markdown';
import { flowPositionStorageKey } from '../lib/flow-position-memory';
import { remarkImageWindows } from '../lib/remark-image-windows';
import { imageWindowSchema, type ImageWindow, type ImageWindows, type ImageEditor } from '../lib/image-window';
import { ResourceVideo } from './ResourceVideo';
import { ImageWindowImage } from './ImageWindowImage';

function containsImage(node: ExtraProps['node']): boolean {
  return !!node && (node.tagName === 'img' || node.children.some((child) => child.type === 'element' && containsImage(child)));
}

function resolveAssetUrl(url: string) {
  return url.startsWith('./assets/') ? url.replace('./assets/', '/assets/') : url;
}

function MarkdownHeading({ level, node, children, className, ...props }: ComponentPropsWithoutRef<'h2'> & ExtraProps & { level: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const Heading = `h${level}` as const;
  const label = toString(node);
  return (
    <Heading {...props} className={['article-heading', className].filter(Boolean).join(' ')} aria-label={label || undefined}>
      {children}
      {props.id ? (
        <a className="heading-link" href={`#${encodeURIComponent(props.id)}`} aria-label={`链接到标题：${label || props.id}`} title="链接到此标题">
          <span aria-hidden="true">#</span>
        </a>
      ) : null}
    </Heading>
  );
}

// Stable component identities also keep the editor's source-follow DOM intact.
const headingComponents = {
  h1: (props: ComponentPropsWithoutRef<'h1'> & ExtraProps) => <MarkdownHeading {...props} level={1} />,
  h2: (props: ComponentPropsWithoutRef<'h2'> & ExtraProps) => <MarkdownHeading {...props} level={2} />,
  h3: (props: ComponentPropsWithoutRef<'h3'> & ExtraProps) => <MarkdownHeading {...props} level={3} />,
  h4: (props: ComponentPropsWithoutRef<'h4'> & ExtraProps) => <MarkdownHeading {...props} level={4} />,
  h5: (props: ComponentPropsWithoutRef<'h5'> & ExtraProps) => <MarkdownHeading {...props} level={5} />,
  h6: (props: ComponentPropsWithoutRef<'h6'> & ExtraProps) => <MarkdownHeading {...props} level={6} />,
};

function MarkdownImage({ src, alt, asset, source, range, flowWidth, window, reference, imageEditor, link }: ComponentPropsWithoutRef<'img'> & { asset?: Asset; source?: SourceAttributes; range?: SourceRange; flowWidth?: number; window?: ImageWindow; reference?: string; imageEditor?: ImageEditor; link?: string }) {
  const safeSrc = typeof src === 'string' ? resolveAssetUrl(src) : '';
  const image = <ImageWindowImage window={window} displayWidth={flowWidth} src={safeSrc} width={window ? asset?.originalWidth ?? asset?.width : asset?.width} height={window ? asset?.originalHeight ?? asset?.height : asset?.height} srcSet={asset?.srcSet} sizes={asset?.srcSet ? '(max-width: 768px) 100vw, 720px' : undefined} alt={alt ?? ''} loading="lazy" />;
  return (
    <figure {...source} className={flowWidth ? "flow-ordinary-image" : undefined} style={flowWidth ? { width: `min(${flowWidth}px, 100%)` } : undefined}>
      {asset?.type === 'video' ? (
        <ResourceVideo src={safeSrc} poster={asset.poster} controls preload="metadata" aria-label={alt || '文章短视频'} />
      ) : (
        link ? <a href={link}>{image}</a> : image
      )}
      {alt ? <figcaption>{link ? <a href={link}>{alt}</a> : alt}</figcaption> : null}
      {imageEditor && reference && asset?.type === 'image' && safeSrc ? <button type="button" className="preview-image-crop" data-preview-control="true" onClick={(event) => { event.preventDefault(); event.stopPropagation(); imageEditor({ reference, url: safeSrc, label: alt ?? reference, window, width: asset.width, height: asset.height, source: range }); }}>裁剪可视窗口</button> : null}
    </figure>
  );
}

type FlowRenderData = { flowRegion?: FlowRegion; flowKey?: string; layoutMode?: 'responsive' | 'desktop'; imageEditor?: ImageEditor };
function FlowContainer({ node, children, ...props }: ComponentPropsWithoutRef<'div'> & ExtraProps) {
  const data = node?.data as FlowRenderData | undefined;
  if (!data?.flowRegion) return <div {...props}>{children}</div>;
  // Writing previews and teaching examples keep their temporary interaction state.
  const storageKey = data.flowKey && !data.flowRegion.source ? flowPositionStorageKey(data.flowKey, data.flowRegion.id) : undefined;
  return <FlowParagraphs key={`${data.flowKey}:${data.flowRegion.id}`} {...data.flowRegion} imageEditor={data.imageEditor} layoutMode={data.layoutMode} storageKey={storageKey} />;
}
function rehypeFlowPresentation(options: { flows: FlowRegion[]; flowKey: string; layoutMode: 'responsive' | 'desktop'; imageEditor?: ImageEditor }) {
  return (tree: Root) => {
    const regions = new Map(options.flows.map((region) => [region.id, region]));
    visit(tree, 'element', (node) => {
      const flowRegion = regions.get(String(node.properties['data-flow-id']));
      if (flowRegion) node.data = { ...node.data, flowRegion, flowKey: options.flowKey, layoutMode: options.layoutMode, imageEditor: options.imageEditor } as typeof node.data;
    });
  };
}

export function MarkdownContent({ markdown, type, imageWindows, imageEditor, assets = {}, basePath = process.env.NEXT_PUBLIC_BLOG_BASE_PATH ?? '', sourceOrigin, leadingFlow = false, flows = [], flowWidths = {}, flowKey = '', layoutMode = 'responsive' }: { markdown: string; type?: ArticleType; imageWindows?: ImageWindows; imageEditor?: ImageEditor; assets?: Record<string, Asset>; basePath?: string; sourceOrigin?: SourceOrigin; leadingFlow?: boolean; flows?: FlowRegion[]; flowWidths?: Record<string, number>; flowKey?: string; layoutMode?: 'responsive' | 'desktop' }) {
  const marker = (node: ExtraProps['node'], kind: string) => sourceOrigin ? sourceAttributes(sourceRange(node?.position, sourceOrigin), kind) : {};
  const localUrl = (url: string) => withBasePath(url, basePath);
  const assetsByUrl = new Map(Object.values(assets).map((asset) => [localUrl(asset.url), asset]));
  const resolve = (url: string) => {
    const [base, fragment] = url.split('#');
    const mapped = assets[url]?.url ?? assets[base]?.url;
    return localUrl(defaultUrlTransform(mapped ? `${mapped}${fragment ? `#${fragment}` : ''}` : resolveAssetUrl(url)));
  };
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkTextSize, [remarkImageWindows, imageWindows], [remarkPoetry, { enabled: type === 'poem' }], remarkFirstLineIndent, [remarkArticleStructure, { leadingFlow }], ...(sourceOrigin ? [[remarkSourceLines, sourceOrigin] as [typeof remarkSourceLines, SourceOrigin]] : []), [remarkFlowRegions, { flows, widths: flowWidths }]]}
      rehypePlugins={[rehypeCodeHighlight, rehypeMath, [rehypeFlowPresentation, { flows, flowKey, layoutMode, imageEditor }]]}
      urlTransform={resolve}
      components={{
        ...headingComponents,
        div: FlowContainer,
        pre: ({ node, children }) => <CodeBlock source={marker(node, 'code-block')}>{children}</CodeBlock>,
        p: ({ node, children }) => containsImage(node) ? <div {...marker(node, 'media')} className="markdown-media-paragraph">{children}</div> : <p {...marker(node, 'paragraph')} className={node?.properties['data-poem-stanza'] ? 'poem-stanza' : undefined}>{children}</p>,
        img: (props) => {
          const raw = props.node?.properties['data-image-window'];
          const window = typeof raw === 'string' ? imageWindowSchema.parse(JSON.parse(raw)) : undefined;
          const link = props.node?.properties['data-image-link'];
          return <MarkdownImage {...props} link={typeof link === 'string' ? resolve(link) : undefined} range={sourceOrigin ? sourceRange(props.node?.position, sourceOrigin) : undefined} reference={String(props.node?.properties['data-image-reference'] ?? '')} window={window} imageEditor={imageEditor} flowWidth={Number(props.node?.properties['data-flow-width']) || undefined} source={marker(props.node, 'image')} asset={typeof props.src === 'string' ? assetsByUrl.get(props.src) : undefined} />;
        },
        table: ({ node, children }) => (
          <div {...marker(node, 'table')} className="table-scroll" tabIndex={0} aria-label="可横向滚动的表格">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
