import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument, stringify } from 'yaml';
import { scanContent } from '../../src/lib/blog/content';
import { BlogError, atomicWrite, exists, readJson, safeDirectory, safeFile, sha256, stableJson } from '../../src/lib/blog/files';
import { readSourceSeries, scanSeries, selectSeries, validateSeriesMembers, type SourceSeries } from '../../src/lib/blog/series';
import { categoryNames, seriesRefSchema, seriesSchema, seriesSnapshotSchema, type BlogConfig, type BlogPost, type SeriesSnapshot } from '../../src/lib/blog/schema';
import { immutableWrite, readSnapshot } from './snapshot';
import { storePath } from './config';
import { cachedManifest } from './state';
import { assertNoPendingWrites } from './writing-transactions';

export async function publishedChapters(root: string): Promise<BlogPost[]> {
  const { manifest } = await cachedManifest(root);
  return await Promise.all((manifest?.entries ?? []).map(async (entry) => {
    if (!await exists(storePath(root, 'snapshots', entry.revisionHash, 'snapshot.json'))) throw new BlogError('已发布文章快照缺失，请先恢复公开快照再设置系列序号。', 4);
    return (await readSnapshot(root, entry.revisionHash)).post;
  }));
}

export async function seriesAssignment(root: string, config: BlogConfig, category: BlogPost['category'], selector: string, order?: number) {
  const catalogue = await scanSeries(root);
  if (catalogue.issues.length) throw new BlogError(JSON.stringify(catalogue.issues));
  const definition = selectSeries(catalogue.series, [selector])[0].series;
  if (definition.category !== category) throw new BlogError('系列和文章必须属于同一栏目。');
  const scanned = await scanContent(root, config);
  if (scanned.issues.length) throw new BlogError(JSON.stringify(scanned.issues));
  const local = scanned.posts.map((source) => source.post);
  const published = await publishedChapters(root);
  const maximum = Math.max(0, ...[...local, ...published].filter((post) => post.series?.id === definition.id).map((post) => post.series!.order));
  const result = seriesRefSchema.parse({ id: definition.id, order: order ?? maximum + 1 });
  const candidate = { id: randomUUID(), title: '新章节', category, series: result };
  // Working revisions replace their published counterparts when checking local edits.
  const peers = [...local, ...published.filter((post) => !local.some((item) => item.id === post.id))];
  validateSeriesMembers([...peers, candidate], catalogue.series.map((source) => source.series));
  return result;
}

export async function newSeries(root: string, values: { title: string; category: string; slug?: string; description?: string }) {
  await assertNoPendingWrites(root);
  const category = Object.entries(categoryNames).find(([id, name]) => id === values.category || name === values.category)?.[0];
  const id = randomUUID();
  const series = seriesSchema.parse({ ...values, id, slug: values.slug ?? id, category });
  const catalogue = await scanSeries(root);
  const previous = (await cachedManifest(root)).manifest?.series ?? [];
  if (catalogue.issues.length) throw new BlogError(JSON.stringify(catalogue.issues));
  if ([...catalogue.series.map((item) => item.series), ...previous].some((item) => item.slug.toLowerCase() === series.slug.toLowerCase())) throw new BlogError(`系列 slug 已被使用：${series.slug}`);
  const folder = await safeDirectory(root, 'content/series');
  await writeFile(path.join(folder, `${id}.yaml`), stringify(series), { flag: 'wx' });
  return { ...series, file: `content/series/${id}.yaml`, url: `/series/${series.slug}/` };
}

export async function editSeries(root: string, config: BlogConfig, selector: string, changes: Record<string, unknown>) {
  await assertNoPendingWrites(root);
  const catalogue = await scanSeries(root);
  const source = selectSeries(catalogue.series, [selector])[0];
  const document = parseDocument(source.raw);
  for (const [field, value] of Object.entries(changes)) {
    if (!['title', 'slug', 'description', 'category'].includes(field)) throw new BlogError(`不能修改系列字段：${field}`, 2);
    if (value === null && field !== 'description') throw new BlogError(`不能删除系列 ${field}。`, 2);
    if (value === null) document.delete(field); else document.set(field, value);
  }
  const next = seriesSchema.parse(document.toJSON());
  const previous = (await cachedManifest(root)).manifest?.series ?? [];
  if (previous.some((item) => item.id === next.id && item.slug !== next.slug)) throw new BlogError('已发布系列不能修改 slug。');
  if ([...catalogue.series.map((item) => item.series), ...previous].some((item) => item.id !== next.id && item.slug.toLowerCase() === next.slug.toLowerCase())) throw new BlogError('系列 slug 已被使用。');
  const local = (await scanContent(root, config)).posts.map((item) => item.post);
  const published = await publishedChapters(root);
  validateSeriesMembers([...local, ...published.filter((post) => !local.some((item) => item.id === post.id))], catalogue.series.map((item) => item.series.id === next.id ? next : item.series));
  const file = await safeFile(root, source.sourcePath);
  if (await readFile(file, 'utf8') !== source.raw) throw new BlogError('系列资料在编辑期间发生变化，未覆盖。', 4);
  await atomicWrite(file, document.toString());
  return next;
}

export async function saveSeriesSnapshot(root: string, source: SourceSeries): Promise<SeriesSnapshot> {
  const fresh = await readSourceSeries(root, source.sourcePath);
  if (fresh.revisionHash !== source.revisionHash || fresh.raw !== source.raw) throw new BlogError(`确认后系列资料发生变化：${source.series.title}`, 4);
  const directory = storePath(root, 'series-snapshots', source.revisionHash);
  if (await exists(path.join(directory, 'snapshot.json'))) return await readSeriesSnapshot(root, source.revisionHash);
  const snapshot: SeriesSnapshot = { schemaVersion: 1, revisionHash: source.revisionHash, sourceHash: sha256(source.raw), sourcePath: source.sourcePath, series: source.series };
  await immutableWrite(path.join(directory, 'source.yaml'), source.raw);
  await immutableWrite(path.join(directory, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
  return snapshot;
}

export async function readSeriesSnapshot(root: string, hash: string) {
  const directory = storePath(root, 'series-snapshots', hash);
  const snapshot = seriesSnapshotSchema.parse(await readJson(await safeFile(directory, 'snapshot.json')));
  if (snapshot.revisionHash !== hash || sha256(stableJson(snapshot.series)) !== hash || sha256(await readFile(await safeFile(directory, 'source.yaml'))) !== snapshot.sourceHash) throw new BlogError(`系列快照摘要不匹配：${hash}`, 4);
  return snapshot;
}
