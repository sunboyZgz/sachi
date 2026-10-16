import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { BlogError, exists, safeFile, sha256, stableJson } from './files';
import { seriesSchema, type BlogPost, type Series } from './schema';
import { contentDirectory, logicalSourcePath } from './storage';

export type SourceSeries = { series: Series; sourcePath: string; raw: string; revisionHash: string };
export type SeriesWithPosts = Series & { chapters: BlogPost[]; updatedAt?: string };

export async function readSourceSeries(root: string, sourcePath: string, contentDir?: string): Promise<SourceSeries> {
  sourcePath = logicalSourcePath(sourcePath);
  contentDir ??= await contentDirectory(root);
  if (!/^content\/series\/[a-f0-9-]{36}\.yaml$/i.test(sourcePath)) throw new BlogError(`系列资料路径无效：${sourcePath}`);
  const file = await safeFile(path.join(root, contentDir), sourcePath.slice('content/'.length));
  const raw = await readFile(file, 'utf8');
  const document = parseDocument(raw);
  if (document.errors.length) throw new BlogError(`系列 YAML 无效：${document.errors[0].message}`);
  const series = seriesSchema.parse(document.toJSON());
  if (path.basename(sourcePath, '.yaml') !== series.id) throw new BlogError('系列文件名必须与 id 一致。');
  return { series, sourcePath, raw, revisionHash: sha256(stableJson(series)) };
}

export async function scanSeries(root: string, contentDir?: string) {
  contentDir ??= await contentDirectory(root);
  const folder = path.join(root, contentDir, 'series');
  const series: SourceSeries[] = [];
  const issues: Array<{ file: string; message: string }> = [];
  if (!await exists(folder)) return { series, issues };
  // safeFile also rejects a symlink at the catalogue root or any parent.
  for (const item of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (item.isFile() && ['.DS_Store', '.gitkeep'].includes(item.name)) continue;
    const file = `content/series/${item.name}`;
    if (!item.isFile() || !item.name.endsWith('.yaml')) { issues.push({ file, message: '系列目录仅允许普通 UUID.yaml 文件。' }); continue; }
    try { series.push(await readSourceSeries(root, file, contentDir)); }
    catch (error) { issues.push({ file, message: error instanceof Error ? error.message : String(error) }); }
  }
  for (const field of ['id', 'slug'] as const) {
    const seen = new Set<string>();
    for (const source of series) {
      const value = source.series[field].toLowerCase();
      if (seen.has(value)) issues.push({ file: source.sourcePath, message: `系列 ${field} 重复：${value}` });
      seen.add(value);
    }
  }
  return { series, issues };
}

export function validateSeriesMembers(posts: Pick<BlogPost, 'id' | 'title' | 'category' | 'series'>[], definitions: Series[]) {
  const groups = new Map(definitions.map((series) => [series.id, series]));
  const orders = new Map<string, Set<number>>();
  for (const post of posts) {
    if (!post.series) continue;
    const series = groups.get(post.series.id);
    if (!series) throw new BlogError(`文章 ${post.title} 引用了不存在的系列：${post.series.id}`);
    if (post.category !== series.category) throw new BlogError(`文章 ${post.title} 与系列 ${series.title} 必须属于同一栏目。`);
    const used = orders.get(series.id) ?? new Set<number>();
    if (used.has(post.series.order)) throw new BlogError(`系列 ${series.title} 的章节序号重复：${post.series.order}`);
    used.add(post.series.order); orders.set(series.id, used);
  }
}

export function seriesIndex(posts: BlogPost[], definitions: Series[]): SeriesWithPosts[] {
  validateSeriesMembers(posts, definitions);
  return definitions.flatMap((series) => {
    const chapters = posts.filter((post) => post.series?.id === series.id).sort((a, b) => a.series!.order - b.series!.order);
    return chapters.length ? [{ ...series, chapters, updatedAt: chapters.map((post) => post.updatedAt).filter((value): value is string => !!value).sort().at(-1) }] : [];
  });
}

export function selectSeries(sources: SourceSeries[], selectors: string[]) {
  return selectors.map((selector) => {
    const found = sources.find((source) => [source.series.id, source.series.slug, source.sourcePath].includes(logicalSourcePath(selector)));
    if (!found) throw new BlogError(`找不到系列：${selector}`);
    return found;
  });
}
