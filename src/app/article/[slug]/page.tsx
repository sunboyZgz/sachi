import type { Metadata } from 'next';
import { SiteLink as Link } from '@/components/SiteLink';
import { notFound } from 'next/navigation';
import { AuthorSignature } from '@/components/AuthorSignature';
import { ArticleIntro } from '@/components/ArticleIntro';
import { ArticleProse } from '@/components/ArticleProse';
import { DesktopArticleToc, MobileArticleToc } from '@/components/ArticleToc';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { getCategory } from '@/config/site';
import { getAllPosts, getPost, getPostSeries } from '@/lib/content';
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

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const category = getCategory(post.category);
  if (!category) notFound();
  const parsed = parseMarkdown(post.body, post.flow, post.assets, undefined, { type: post.type });
  const series = await getPostSeries(post);

  return (
    <div className="article-shell">
      <JsonLd data={await articleJsonLd(post)} />
      <Header backHref={`/category/${category.id}/`} backLabel={category.name} />
      <div className={`article-layout${post.type === 'poem' ? ' article-layout--poem' : ''}`}>
        <main id="main" className="article-main" data-article-type={post.type} tabIndex={-1}>
          <ArticleIntro post={post} />
          {series ? <p className="article-series"><Link href={`/series/${series.slug}/`}>{series.title} · 第 {String(post.series!.order).padStart(2, '0')} 篇</Link></p> : null}
          <MobileArticleToc headings={parsed.headings} />
          <div className="article-intro-rule" aria-hidden="true" />
          <ArticleProse parsed={parsed} assets={post.assets} flowKey={post.id} />
          {series ? <SeriesNavigation series={series} postId={post.id} /> : null}
          <AuthorSignature />
          <div className="article-end">
            <Link className="quiet-link" href="/contents/">← 返回目录</Link>
            {post.fixture ? <span className="micro">本文为排版示例，非已发布内容。</span> : null}
          </div>
        </main>
        {post.type === 'poem' ? null : <DesktopArticleToc headings={parsed.headings} />}
      </div>
      <Footer note={post.fixture ? '文章页 · 阅读排版样板' : '文章页'} />
    </div>
  );
}
