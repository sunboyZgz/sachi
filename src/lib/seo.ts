import type { Metadata, MetadataRoute } from 'next';
import { cache } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { categories, getCategory, postsPerPage, profile, siteAsset } from '@/config/site';
import { configSchema, defaultConfig, type BlogPost } from './blog/schema';
import { parseMarkdown } from './markdown';
import { withBasePath } from './site-path';
import type { SeriesWithPosts } from './blog/series';

export type SeoContext = { siteUrl: string | null; release: boolean; indexable: boolean };

export const getSeoContext = cache(async (): Promise<SeoContext> => {
  let config = defaultConfig();
  try { config = configSchema.parse(JSON.parse(await readFile(path.join(process.cwd(), 'blog.config.json'), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const release = process.env.NODE_ENV === 'production' && process.env.BLOG_CONTENT_MODE === 'release' && process.env.INCLUDE_FIXTURES !== 'true';
  return { siteUrl: config.siteUrl ? `${config.siteUrl.replace(/\/$/, '')}/` : null, release, indexable: release && !!config.siteUrl && profile.seo.allowIndexing };
});

export function publicUrl(context: SeoContext, pathname: string) {
  if (!context.siteUrl || !context.release) return undefined;
  const base = new URL(context.siteUrl);
  const basePath = base.pathname.replace(/\/$/, '');
  return new URL(withBasePath(pathname, basePath), `${base.origin}/`).href;
}

export const noIndex: Metadata['robots'] = { index: false, follow: false };

function socialImage(context: SeoContext, post?: BlogPost) {
  const cover = post?.cover ? Object.values(post.assets).find((asset) => asset.url === post.cover && asset.type === 'image') : undefined;
  const url = publicUrl(context, cover ? cover.url : siteAsset('/assets/desk-scene.webp'));
  return url ? [{ url, width: cover?.width ?? 985, height: cover?.height ?? 763, alt: cover ? post!.title : `${profile.name}的创作桌面` }] : [];
}

export function createPageMetadata(context: SeoContext, options: { path: string; title: string; description: string; home?: boolean; post?: BlogPost; noIndex?: boolean }): Metadata {
  const eligible = !options.noIndex && !options.post?.fixture;
  const canonical = eligible ? publicUrl(context, options.path) : undefined;
  const fullTitle = options.home ? profile.name : `${options.title} · ${profile.name}`;
  const images = canonical ? socialImage(context, options.post) : [];
  return {
    title: options.home ? { absolute: profile.name } : options.title,
    description: options.description,
    authors: [{ name: profile.name, url: profile.authorUrl ?? undefined }],
    alternates: { canonical: canonical ?? null },
    robots: context.indexable && eligible ? { index: true, follow: true, googleBot: { 'max-image-preview': 'large' } } : noIndex,
    openGraph: {
      type: options.post ? 'article' : 'website', title: fullTitle, description: options.description,
      siteName: profile.name, locale: 'zh_CN', url: canonical, images,
      ...(options.post && eligible ? {
        publishedTime: options.post.publishedAt,
        modifiedTime: options.post.updatedAt,
        authors: [profile.name], section: getCategory(options.post.category)?.name, tags: options.post.tags,
      } : {}),
    },
    twitter: { card: images.length ? 'summary_large_image' : 'summary', title: fullTitle, description: options.description, images },
  };
}

export async function pageMetadata(options: Parameters<typeof createPageMetadata>[1]) {
  return createPageMetadata(await getSeoContext(), options);
}

export function postDescription(post: BlogPost) {
  return post.summary ?? parseMarkdown(post.body, post.flow, post.assets, undefined, { type: post.type, imageWindows: post.imageWindows }).description;
}

function person(context: SeoContext) {
  return { '@type': 'Person', '@id': publicUrl(context, '/#author'), name: profile.name, description: profile.bio,
    url: profile.authorUrl ?? publicUrl(context, '/'), ...(profile.sameAs.length ? { sameAs: profile.sameAs } : {}) };
}

export async function websiteJsonLd() {
  const context = await getSeoContext();
  if (!context.indexable) return null;
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': publicUrl(context, '/#website'), url: publicUrl(context, '/'), name: profile.name,
      description: profile.seo.description ?? profile.bio, inLanguage: 'zh-CN', author: person(context) },
    person(context),
  ] };
}

export function createArticleJsonLd(context: SeoContext, post: BlogPost) {
  if (!context.indexable || post.fixture) return null;
  const category = getCategory(post.category)!;
  const url = publicUrl(context, `/article/${post.slug}/`);
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'BlogPosting', '@id': `${url}#article`, url, mainEntityOfPage: url, headline: post.title,
      description: postDescription(post), inLanguage: 'zh-CN', datePublished: post.publishedAt,
      dateModified: post.updatedAt, articleSection: category.name, keywords: post.tags,
      author: person(context), image: socialImage(context, post).map((image) => image.url) },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '目录', item: publicUrl(context, '/contents/') },
      { '@type': 'ListItem', position: 2, name: category.name, item: publicUrl(context, `/category/${category.id}/`) },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ] },
  ] };
}

export async function articleJsonLd(post: BlogPost) { return createArticleJsonLd(await getSeoContext(), post); }

export function createSitemap(context: SeoContext, posts: BlogPost[], series: SeriesWithPosts[] = []): MetadataRoute.Sitemap {
  if (!context.indexable) return [];
  const published = posts.filter((post) => !post.fixture);
  const result: MetadataRoute.Sitemap = [
    { url: publicUrl(context, '/')! }, { url: publicUrl(context, '/contents/')! }, { url: publicUrl(context, '/about/')! },
  ];
  for (const category of categories) {
    const entries = published.filter((post) => post.category === category.id);
    // Empty categories are navigable, but aren't useful search results.
    for (let page = 1; page <= Math.ceil(entries.length / postsPerPage); page += 1) {
      result.push({ url: publicUrl(context, `/category/${category.id}/${page === 1 ? '' : `page/${page}/`}`)! });
    }
  }
  for (const post of published) {
    const cover = post.cover && Object.values(post.assets).find((asset) => asset.url === post.cover && asset.type === 'image');
    result.push({ url: publicUrl(context, `/article/${post.slug}/`)!, lastModified: post.updatedAt ?? post.publishedAt,
      ...(cover ? { images: [publicUrl(context, cover.url)!] } : {}) });
  }
  for (const entry of series) if (entry.chapters.some((post) => !post.fixture)) result.push({ url: publicUrl(context, `/series/${entry.slug}/`)!, ...(entry.updatedAt ? { lastModified: entry.updatedAt } : {}) });
  return result;
}

export function createRobots(context: SeoContext): MetadataRoute.Robots {
  // Let crawlers read noindex on preview/404 pages. robots.txt isn't access
  // control; drafts are kept out of the exported files, not protected here.
  return { rules: { userAgent: '*', allow: '/' },
    ...(context.indexable ? { sitemap: publicUrl(context, '/sitemap.xml') } : {}) };
}

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
