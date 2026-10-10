import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { SiteLink as Link } from '@/components/SiteLink';
import { dateLabel, getCategory } from '@/config/site';
import { getAllSeries, getSeries } from '@/lib/content';
import { noIndex, pageMetadata } from '@/lib/seo';

export const dynamicParams = false;

export async function generateStaticParams() {
  const series = await getAllSeries();
  return series.length ? series.map((entry) => ({ slug: entry.slug })) : [{ slug: '__empty__' }];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const series = await getSeries((await params).slug);
  if (!series) return { robots: noIndex };
  return pageMetadata({ path: `/series/${series.slug}/`, title: series.title, description: series.description || `${series.title}，按章节顺序阅读的系列目录。`, noIndex: series.chapters.every((post) => post.fixture) });
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const series = await getSeries((await params).slug);
  if (!series) notFound();
  const category = getCategory(series.category)!;
  return (
    <div className="series-page frame">
      <Header backHref={`/category/${category.id}/`} backLabel={`返回${category.name}`} />
      <main id="main" className="series-main" tabIndex={-1}>
        <h1>{series.title}</h1>
        {series.description ? <p className="series-description">{series.description}</p> : null}
        <p className="series-count">{series.chapters.every((post) => !!post.publishedAt) ? '已发布 ' : '共 '}{series.chapters.length} 篇</p>
        <ol className="series-chapters">
          {series.chapters.map((post) => (
            <li key={post.id}>
              <Link href={`/article/${post.slug}/`}>
                <span className="series-order">{String(post.series!.order).padStart(2, '0')}</span>
                <h2>{post.title}</h2>
                <time dateTime={post.date}>{dateLabel(post.date)}</time>
              </Link>
            </li>
          ))}
        </ol>
      </main>
      <Footer note="系列目录" />
    </div>
  );
}
