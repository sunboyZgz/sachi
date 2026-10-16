import { cache } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { configSchema, defaultConfig, manifestSchema } from './schema';
import { publicationDays, zonedDay } from '../writing-calendar';
import { getAllPosts } from '../content';

export const getWritingActivity = cache(async () => {
  const root = process.cwd();
  let config = defaultConfig();
  try { config = configSchema.parse(JSON.parse(await readFile(path.join(root, 'blog.config.json'), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const timeZone = process.env.BLOG_TIMEZONE ?? config.timezone;
  const today = zonedDay(new Date().toISOString(), timeZone);
  const fixture = process.env.INCLUDE_FIXTURES === 'true';

  if (fixture) {
    const posts = await getAllPosts();
    return { timeZone, today, asOf: today, fixture, posts: publicationDays(posts.map((post) => ({ ...post, publishedAt: `${post.date}T12:00:00Z` })), timeZone, today, true) };
  }

  let manifest = null;
  if (process.env.BLOG_CONTENT_MODE === 'release') {
    if (!process.env.BLOG_RELEASE_MANIFEST) throw new Error('release 模式缺少发布清单。');
    manifest = manifestSchema.parse(JSON.parse(await readFile(process.env.BLOG_RELEASE_MANIFEST, 'utf8')));
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('正式写作日历必须使用发布清单。');
    try {
      const current = JSON.parse(await readFile(path.join(root, '.blog-store/current.json'), 'utf8')) as { manifest?: unknown };
      if (current.manifest) manifest = manifestSchema.parse(current.manifest);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const asOf = manifest ? zonedDay(manifest.createdAt, timeZone) : null;
  return { timeZone, today, asOf, fixture, posts: manifest ? publicationDays(manifest.entries, timeZone, asOf && asOf < today ? asOf : today) : [] };
});
