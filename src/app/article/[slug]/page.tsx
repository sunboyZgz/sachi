import type { Metadata } from 'next';
import { SiteLink as Link } from '@/components/SiteLink';
import { notFound } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';
import { AuthorSignature } from '@/components/AuthorSignature';
import { DesktopArticleToc, MobileArticleToc } from '@/components/ArticleToc';
import { FlowParagraphs } from '@/components/FlowParagraphs';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { MarkdownContent } from '@/components/MarkdownContent';
import { dateLabel, getCategory } from '@/config/site';
import { getAllPosts, getPost, getPostSeries, type Post } from '@/lib/content';
import { SeriesNavigation } from '@/components/SeriesNavigation';
import { parseMarkdown } from '@/lib/markdown';
import { JsonLd } from '@/components/JsonLd';
import { articleJsonLd, noIndex, pageMetadata, postDescription } from '@/lib/seo';

export const dynamicParams = false;

export async function generateStaticParams() {
  const posts = await getAllPosts();
  // Next static export rejects an empty generateStaticParams result.
  // The sentinel is unlinked and renders through notFound() when no public post exists.
  return posts.length ? posts.map((post) => ({ slug: post.slug })) : [{ slug: '__empty__' }];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { robots: noIndex };
  return pageMetadata({ path: `/article/${post.slug}/`, title: post.title, description: postDescription(post), post });
}

function metadataItems(post: Post, categoryName: string): ReactNode[] {
  const items: ReactNode[] = [<time dateTime={post.date} key="date">{dateLabel(post.date)}</time>];
  if (post.category === 'play') {
    items.push(post.status, ...post.tags);
  } else {
    items.push(categoryName);
    if (post.category === 'learn') items.push(...post.tags, `约 ${post.minutes} 分钟`);
  }
  return items;
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const category = getCategory(post.category);
  if (!category) notFound();
  const parsed = parseMarkdown(post.body, post.flow, post.assets);
  const series = await getPostSeries(post);
  const items = metadataItems(post, category.name);

  return (
    <div className="article-shell">
      <JsonLd data={await articleJsonLd(post)} />
      <Header backHref={`/category/${category.id}/`} backLabel={category.name} />
      <div className="article-layout">
        <main id="main" className="article-main" tabIndex={-1}>
          <p className="article-category">{category.name}</p>
          <h1>{post.title}</h1>
          <div className="meta">
            {items.map((item, index) => (
              <Fragment key={typeof item === 'string' ? `${item}-${index}` : index}>
                {index ? <span className="separator" aria-hidden="true" /> : null}
                {item}
              </Fragment>
            ))}
          </div>
          {series ? <p className="article-series"><Link href={`/series/${series.slug}/`}>{series.title} · 第 {String(post.series!.order).padStart(2, '0')} 篇</Link></p> : null}
          <MobileArticleToc headings={parsed.headings} />
          <div className="article-intro-rule" aria-hidden="true" />
          <div className="article-prose">
            {parsed.flow ? <FlowParagraphs key={`${post.id}:${parsed.flow.spec.image}:${parsed.flow.spec.contour ?? ''}`} paragraphs={parsed.flow.paragraphs} spec={parsed.flow.spec} /> : null}
            <MarkdownContent markdown={parsed.markdown} assets={post.assets} />
          </div>
          {series ? <SeriesNavigation series={series} postId={post.id} /> : null}
          <AuthorSignature />
          <div className="article-end">
            <Link className="quiet-link" href="/contents/">← 返回目录</Link>
            {post.fixture ? <span className="micro">本文为排版示例，非已发布内容。</span> : null}
          </div>
        </main>
        <DesktopArticleToc headings={parsed.headings} />
      </div>
      <Footer note={post.fixture ? '文章页 · 阅读排版样板' : '文章页'} />
    </div>
  );
}
