import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { defaultUrlTransform, type ExtraProps } from 'react-markdown';
import { toString } from 'mdast-util-to-string';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import type { Asset } from '../lib/blog/schema';
import { withBasePath } from '../lib/site-path';
import { CodeBlock } from './CodeBlock';

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

function MarkdownImage({ src, alt, asset }: ComponentPropsWithoutRef<'img'> & { asset?: Asset }) {
  const safeSrc = typeof src === 'string' ? resolveAssetUrl(src) : '';
  return (
    <figure>
      {asset?.type === 'video' ? (
        <video src={safeSrc} poster={asset.poster} controls preload="metadata" aria-label={alt || '文章短视频'} />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={safeSrc} width={asset?.width} height={asset?.height} srcSet={asset?.srcSet} sizes={asset?.srcSet ? '(max-width: 768px) 100vw, 720px' : undefined} alt={alt ?? ''} loading="lazy" />
      )}
      {alt ? <figcaption>{alt}</figcaption> : null}
    </figure>
  );
}

export function MarkdownContent({ markdown, assets = {}, basePath = process.env.NEXT_PUBLIC_BLOG_BASE_PATH ?? '' }: { markdown: string; assets?: Record<string, Asset>; basePath?: string }) {
  const localUrl = (url: string) => withBasePath(url, basePath);
  const assetsByUrl = new Map(Object.values(assets).map((asset) => [localUrl(asset.url), asset]));
  const resolve = (url: string) => {
    const [base, fragment] = url.split('#');
    const mapped = assets[url]?.url ?? assets[base]?.url;
    return localUrl(defaultUrlTransform(mapped ? `${mapped}${fragment ? `#${fragment}` : ''}` : resolveAssetUrl(url)));
  };
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug]}
      urlTransform={resolve}
      components={{
        h1: (props) => <MarkdownHeading {...props} level={1} />,
        h2: (props) => <MarkdownHeading {...props} level={2} />,
        h3: (props) => <MarkdownHeading {...props} level={3} />,
        h4: (props) => <MarkdownHeading {...props} level={4} />,
        h5: (props) => <MarkdownHeading {...props} level={5} />,
        h6: (props) => <MarkdownHeading {...props} level={6} />,
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        p: ({ node, children }) => node?.children.some((child) => child.type === 'element' && child.tagName === 'img') ? <div className="markdown-media-paragraph">{children}</div> : <p>{children}</p>,
        img: (props) => <MarkdownImage {...props} asset={typeof props.src === 'string' ? assetsByUrl.get(props.src) : undefined} />,
        table: ({ children }) => (
          <div className="table-scroll" tabIndex={0} aria-label="可横向滚动的表格">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
