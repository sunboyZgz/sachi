import Image from 'next/image';
import type { CSSProperties } from 'react';
import { SiteLink as Link } from '@/components/SiteLink';
import { Arrow } from '@/components/Arrow';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { LeisureReveal } from '@/components/LeisureReveal';
import { Pagination } from '@/components/Pagination';
import { dateLabel, postsPerPage, type CategoryId } from '@/config/site';
import { fixturesAreVisible, getAllSeries, type Post } from '@/lib/content';
import { galleryItems } from '@/config/gallery';
import { normalizeGalleryItems } from '@/lib/gallery/items';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { GalleryItem } from '@/lib/gallery/types';

export async function CategoryListing({
  category,
  posts,
  page,
}: {
  category: { id: CategoryId; name: string; image: string };
  posts: Post[];
  page: number;
}) {
  const total = Math.max(1, Math.ceil(posts.length / postsPerPage));
  const shown = posts.slice((page - 1) * postsPerPage, page * postsPerPage);
  const series = new Map((await getAllSeries()).map((entry) => [entry.id, entry.title]));
  const listing = (
    <div className="category frame">
      <Header backHref="/contents/" backLabel="返回目录" />
      <main id="main" className="category-main" tabIndex={-1} style={{ '--category-page-size': postsPerPage } as CSSProperties}>
        <div className="category-title-row">
          <h1>{category.name}</h1>
          <span className="micro">{String(posts.length).padStart(2, '0')} 篇</span>
        </div>
        <div className={`category-table${total > 1 ? ' category-table--paginated' : ''}`}>
          {shown.length ? shown.map((post, index) => (
            <Link className="category-row" href={`/article/${post.slug}/`} key={post.slug}>
              <span className="serial">
                {String((page - 1) * postsPerPage + index + 1).padStart(2, '0')}
              </span>
              <div>
                <h2>{post.title}</h2>
                <time dateTime={post.date}>{dateLabel(post.date)}</time>
                {post.series ? <span className="category-series">{series.get(post.series.id)} · 第 {String(post.series.order).padStart(2, '0')} 篇</span> : null}
              </div>
              <Image src={post.cover ?? category.image} alt="" width={112} height={80} loading="eager" />
              <Arrow />
            </Link>
          )) : (
            <p className="content-empty">这里还没有公开文章。</p>
          )}
        </div>
        <Pagination category={category.id} current={page} total={total} />
      </main>
      <Footer />
    </div>
  );
  if (category.id !== 'play') return listing;
  const works: readonly GalleryItem[] = fixturesAreVisible() ? JSON.parse(await readFile(path.join(process.cwd(), 'tests/fixtures/gallery/items.json'), 'utf8')) : galleryItems;
  return <LeisureReveal key={page} items={normalizeGalleryItems(works)}>{listing}</LeisureReveal>;
}
