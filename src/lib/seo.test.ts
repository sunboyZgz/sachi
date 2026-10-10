import { describe, expect, it } from 'vitest';
import { profile } from '@/config/site';
import { configSchema, postSchema } from './blog/schema';
import { seriesIndex } from './blog/series';
import { createArticleJsonLd, createPageMetadata, createRobots, createSitemap, publicUrl, serializeJsonLd, type SeoContext } from './seo';

const context: SeoContext = { siteUrl: 'https://blog.example.org', release: true, indexable: true };
function post(slug = 'public-post') {
  return postSchema.parse({ id: 'legacy-0123456789abcdef01234567', slug, title: '公开文章', date: '2026-10-01',
    createdAt: '2026-09-29T02:00:00Z', publishedAt: '2026-10-01T02:00:00Z', updatedAt: '2026-10-02T02:00:00Z',
    category: 'learn', body: '摘要段落。\n\n## 正文\n\n内容。', minutes: 2,
    cover: '/media/post/cover.png', assets: { './assets/cover.png': { url: '/media/post/cover.png', type: 'image', width: 600, height: 400 } } });
}

describe('published-only SEO', () => {
  it('indexes only active public series and keeps series URLs under the Pages prefix', () => {
    const definition = { id: 'fc455eba-b4d8-4faa-9dc8-0b849d99a141', slug: 'notes', title: '记录', category: 'learn' as const };
    const chapter = { ...post(), series: { id: definition.id, order: 1 } };
    const pages = { ...context, siteUrl: 'https://owner.github.io/sachi/' };
    expect(createSitemap(pages, [chapter], seriesIndex([chapter], [definition])).map((entry) => entry.url)).toContain('https://owner.github.io/sachi/series/notes/');
    expect(createSitemap(pages, [], seriesIndex([], [definition])).some((entry) => entry.url.includes('/series/'))).toBe(false);
    const fixture = { ...chapter, fixture: true };
    expect(createSitemap(pages, [fixture], seriesIndex([fixture], [definition])).some((entry) => entry.url.includes('/series/'))).toBe(false);
  });
  it('builds canonical, social cards and actual release dates for published articles', () => {
    const entry = post();
    const metadata = createPageMetadata(context, { path: '/article/public-post/', title: entry.title, description: '摘要', post: entry });
    expect(metadata.alternates?.canonical).toBe('https://blog.example.org/article/public-post/');
    expect(metadata.openGraph).toMatchObject({ type: 'article', title: `公开文章 · ${profile.name}`, publishedTime: entry.publishedAt, modifiedTime: entry.updatedAt, images: [{ url: 'https://blog.example.org/media/post/cover.png' }] });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(metadata.robots).toMatchObject({ index: true });
    expect(createArticleJsonLd(context, entry)?.['@graph'][0]).toMatchObject({ '@type': 'BlogPosting', datePublished: entry.publishedAt, dateModified: entry.updatedAt, author: { name: profile.name } });
  });
  it('omits preview/fixture canonicals, sitemap and structured data without inventing a domain', () => {
    for (const ctx of [{ siteUrl: null, release: true, indexable: false }, { siteUrl: context.siteUrl, release: false, indexable: false }]) {
      expect(publicUrl(ctx, '/')).toBeUndefined();
      expect(createPageMetadata(ctx, { path: '/', title: profile.name, description: profile.bio, home: true }).robots).toMatchObject({ index: false });
      expect(createSitemap(ctx, [post()])).toEqual([]);
      expect(createRobots(ctx).sitemap).toBeUndefined();
      expect(createArticleJsonLd(ctx, post())).toBeNull();
    }
    const fixture = { ...post(), fixture: true };
    expect(createPageMetadata(context, { path: '/article/public-post/', title: fixture.title, description: '', post: fixture }).alternates?.canonical).toBeNull();
    expect(createArticleJsonLd(context, fixture)).toBeNull();
  });
  it('includes each real pagination URL once and excludes fixtures and sentinel pages', () => {
    const entries = [post('one'), post('two'), post('three'), post('four'), { ...post('fixture'), fixture: true }];
    const sitemap = createSitemap(context, entries);
    const urls = sitemap.map((item) => item.url);
    expect(urls).toContain('https://blog.example.org/category/learn/page/2/');
    expect(urls).not.toContain('https://blog.example.org/category/play/');
    expect(urls.some((url) => /fixture|__empty__|\/page\/1\//.test(url))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
    expect(sitemap.find((entry) => entry.url.endsWith('/article/one/'))?.lastModified).toBe('2026-10-02T02:00:00Z');
    expect(createRobots(context)).toEqual({ rules: { userAgent: '*', allow: '/' }, sitemap: 'https://blog.example.org/sitemap.xml' });
  });
  it('escapes script termination while preserving the JSON payload', () => {
    const data = { headline: '</script><script>alert(1)</script>\u2028' };
    const text = serializeJsonLd(data);
    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toEqual(data);
  });
  it('allows Pages subpaths while rejecting credentials and query parameters', () => {
    for (const siteUrl of ['https://user:secret@example.org/', 'https://example.org/?debug=1', 'https://example.org/%2F/']) expect(configSchema.shape.siteUrl.safeParse(siteUrl).success).toBe(false);
    expect(configSchema.shape.siteUrl.safeParse('https://example.org/blog/').success).toBe(true);
    expect(configSchema.shape.siteUrl.safeParse('https://blog.example.org').success).toBe(true);
  });
  it('keeps the project Pages prefix in canonical, media, sitemap and robots without duplicating it', () => {
    const pagesContext = { ...context, siteUrl: 'https://owner.github.io/sachi/' };
    expect(publicUrl(pagesContext, '/')).toBe('https://owner.github.io/sachi/');
    expect(publicUrl(pagesContext, '/sachi/media/image.png')).toBe('https://owner.github.io/sachi/media/image.png');
    expect(createPageMetadata(pagesContext, { path: '/article/public-post/', title: '测试', description: '', post: post() }).alternates?.canonical).toBe('https://owner.github.io/sachi/article/public-post/');
    expect(createSitemap(pagesContext, [post()]).every((entry) => entry.url.startsWith(pagesContext.siteUrl))).toBe(true);
    expect(createRobots(pagesContext).sitemap).toBe('https://owner.github.io/sachi/sitemap.xml');
  });
});
