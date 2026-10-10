import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryListing } from '@/components/CategoryListing';
import { categories, getCategory, type CategoryId } from '@/config/site';
import { getCategoryPosts } from '@/lib/content';
import { noIndex, pageMetadata } from '@/lib/seo';
import { profile } from '@/config/site';

export function generateStaticParams() {
  return categories.map((category) => ({ category: category.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const category = getCategory((await params).category);
  if (!category) return { robots: noIndex };
  const posts = await getCategoryPosts(category.id);
  return pageMetadata({ path: `/category/${category.id}/`, title: category.name,
    description: `${profile.name}的${category.name}栏目，按时间归档的文章。`, noIndex: !posts.some((post) => !post.fixture) });
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const id = (await params).category;
  const category = getCategory(id);
  if (!category) notFound();
  const posts = await getCategoryPosts(id as CategoryId);
  return <CategoryListing category={category} posts={posts} page={1} />;
}
