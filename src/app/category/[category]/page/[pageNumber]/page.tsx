import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryListing } from '@/components/CategoryListing';
import { categories, getCategory, postsPerPage, type CategoryId } from '@/config/site';
import { getCategoryPosts } from '@/lib/content';
import { noIndex, pageMetadata } from '@/lib/seo';
import { profile } from '@/config/site';

export const dynamicParams = false;

export async function generateStaticParams() {
  const params = await Promise.all(categories.map(async (category) => {
    const count = (await getCategoryPosts(category.id)).length;
    const total = Math.ceil(count / postsPerPage);
    return Array.from({ length: Math.max(0, total - 1) }, (_, index) => ({
      category: category.id,
      pageNumber: String(index + 2),
    }));
  }));
  const flattened = params.flat();
  // Next static export requires at least one param; an invalid category produces a 404 sentinel.
  return flattened.length ? flattened : [{ category: '__empty__', pageNumber: '2' }];
}

export async function generateMetadata({ params }: { params: Promise<{ category: string; pageNumber: string }> }): Promise<Metadata> {
  const values = await params;
  const category = getCategory(values.category);
  const page = Number(values.pageNumber);
  if (!category || !Number.isInteger(page) || page < 2) return { robots: noIndex };
  const posts = await getCategoryPosts(category.id);
  if (page > Math.ceil(posts.length / postsPerPage)) return { robots: noIndex };
  return pageMetadata({ path: `/category/${category.id}/page/${page}/`, title: `${category.name} · 第 ${page} 页`,
    description: `${profile.name}的${category.name}栏目，第 ${page} 页。`, noIndex: !posts.slice((page - 1) * postsPerPage, page * postsPerPage).some((post) => !post.fixture) });
}

export default async function CategoryPageNumber({ params }: { params: Promise<{ category: string; pageNumber: string }> }) {
  const values = await params;
  const category = getCategory(values.category);
  const page = Number(values.pageNumber);
  if (!category || !Number.isInteger(page) || page < 2) notFound();
  const posts = await getCategoryPosts(values.category as CategoryId);
  const total = Math.ceil(posts.length / postsPerPage);
  if (page > total) notFound();
  return <CategoryListing category={category} posts={posts} page={page} />;
}
