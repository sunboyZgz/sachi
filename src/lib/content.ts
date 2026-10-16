import { cache } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { configSchema, defaultConfig, manifestSchema, postSchema, seriesSchema, type BlogPost, type FlowSpec, type FlowConfig } from './blog/schema';
import { scanSeries, seriesIndex } from './blog/series';
import { sha256, stableJson } from './blog/files';
import { scanContent } from './blog/content';
import { previewPosts } from './blog/preview';
import { contentDirectory } from './blog/storage';

export type { FlowSpec, FlowConfig };
export type Post = BlogPost;
export type PostMeta = Omit<Post, 'body'>;

export function fixturesAreVisible() {
  return process.env.INCLUDE_FIXTURES === 'true';
}
export const getAllPosts = cache(async (): Promise<Post[]> => {
  const root = process.cwd();
  if (process.env.BLOG_CONTENT_MODE === 'release') {
    if (!process.env.BLOG_RELEASE_MANIFEST || !process.env.BLOG_CONTENT_ROOT) throw new Error('release 模式缺少清单或内容目录。');
    const manifest = manifestSchema.parse(JSON.parse(await readFile(process.env.BLOG_RELEASE_MANIFEST, 'utf8')));
    const raw = JSON.parse(await readFile(path.join(process.env.BLOG_CONTENT_ROOT, 'posts.json'), 'utf8')) as unknown[];
    const posts = raw.map((post) => postSchema.parse(post));
    if (posts.length !== manifest.entries.length || posts.some((post) => post.fixture || !manifest.entries.some((entry) => entry.id === post.id && entry.slug === post.slug && stableJson(entry.series ?? null) === stableJson(post.series ?? null)))) throw new Error('发布内容与候选清单不一致。');
    return posts.map((post) => {
      const entry = manifest.entries.find((entry) => entry.id === post.id)!;
      return { ...post, publishedAt: entry.publishedAt, updatedAt: entry.updatedAt };
    }).toSorted((a, b) => b.date.localeCompare(a.date));
  }
  if (process.env.NODE_ENV === 'production' && !fixturesAreVisible()) throw new Error('正式构建必须使用 release 模式，不能读取工作区草稿。请通过 Blog CLI 生成发布包。');
  const fixtureMode = fixturesAreVisible();
  let config = { ...defaultConfig(), contentDir: fixtureMode ? defaultConfig().contentDir : await contentDirectory(root) };
  try { config = configSchema.parse(JSON.parse(await readFile(path.join(root, 'blog.config.json'), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (process.env.BLOG_TIMEZONE) config.timezone = process.env.BLOG_TIMEZONE;
  const { posts, issues } = await scanContent(root, config, fixtureMode ? 'tests/fixtures/content' : config.contentDir);
  if (issues.length) throw new Error(issues.map((issue) => `${issue.file}: ${issue.message}`).join('\n'));
  const catalogue = await scanSeries(root, fixtureMode ? 'tests/fixtures/content' : config.contentDir);
  return (await previewPosts(root, posts.filter((source) => fixtureMode || !source.post.fixture), catalogue.series.map((source) => source.series))).toSorted((a, b) => b.date.localeCompare(a.date));
});

export const getAllSeries = cache(async () => {
  const posts = await getAllPosts();
  if (process.env.BLOG_CONTENT_MODE === 'release') {
    const manifest = manifestSchema.parse(JSON.parse(await readFile(process.env.BLOG_RELEASE_MANIFEST!, 'utf8')));
    const entries = manifest.series ?? [];
    if (!entries.length) return seriesIndex(posts, []);
    const raw = JSON.parse(await readFile(path.join(process.env.BLOG_CONTENT_ROOT!, 'series.json'), 'utf8')) as unknown[];
    const definitions = raw.map((series) => seriesSchema.parse(series));
    if (definitions.length !== entries.length || new Set(definitions.map((item) => item.id)).size !== definitions.length || definitions.some((definition) => !entries.some((entry) => entry.id === definition.id && entry.revisionHash === sha256(stableJson(definition))))) throw new Error('系列内容与候选清单不一致。');
    return seriesIndex(posts, definitions).map((series) => ({ ...series, updatedAt: [series.updatedAt ?? '', entries.find((entry) => entry.id === series.id)!.updatedAt].toSorted().at(-1) }));
  }
  const catalogue = await scanSeries(process.cwd(), fixturesAreVisible() ? 'tests/fixtures/content' : await contentDirectory(process.cwd()));
  if (catalogue.issues.length) throw new Error(JSON.stringify(catalogue.issues));
  return seriesIndex(posts, catalogue.series.map((source) => source.series));
});

export async function getSeries(slug: string) { return (await getAllSeries()).find((series) => series.slug === slug); }
export async function getPostSeries(post: Post) { return post.series ? (await getAllSeries()).find((series) => series.id === post.series!.id) : undefined; }

export async function getPost(slug: string) {
  return (await getAllPosts()).find((post) => post.slug === slug);
}

export async function getCategoryPosts(category: Post['category']) {
  return (await getAllPosts()).filter((post) => post.category === category);
}
