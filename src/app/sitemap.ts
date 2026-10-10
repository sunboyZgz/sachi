import { getAllPosts, getAllSeries } from '@/lib/content';
import { createSitemap, getSeoContext } from '@/lib/seo';

export const dynamic = 'force-static';
export default async function sitemap() {
  const context = await getSeoContext();
  return createSitemap(context, context.indexable ? await getAllPosts() : [], context.indexable ? await getAllSeries() : []);
}
