import { randomUUID } from 'node:crypto';
import { markdownReferences, type SourcePost } from '../../src/lib/blog/content';
import { BlogError } from '../../src/lib/blog/files';
import { type Manifest, type ReleaseEntry } from '../../src/lib/blog/schema';
import { validateSeriesMembers, type SourceSeries } from '../../src/lib/blog/series';
import { resourceUrl } from '../../src/lib/blog/yandu';

export type Plan = { manifest: Manifest; selected: string[]; unchanged: string[]; excluded: string[]; baselineChanged: boolean; selectedSeries?: string[]; seriesChanges?: Array<{ id: string; title: string; from: string | null; to: string }> };
export function createPlan(current: Manifest | null, selected: SourcePost[], all: SourcePost[], code: { hash: string; commit: string | null }, withdrawn: string[] = [], now = new Date(), selectedSeries: SourceSeries[] = []): Plan {
  const entries = new Map((current?.entries ?? []).map((entry) => [entry.id, { ...entry }]));
  const retired = new Map((current?.retired ?? []).map((entry) => [entry.id, { ...entry }]));
  const time = now.toISOString();
  const ids = new Set<string>();
  for (const source of selected) {
    const old = entries.get(source.post.id) ?? retired.get(source.post.id);
    if (old && old.slug !== source.post.slug) throw new BlogError(`已发布文章不能修改 slug：${source.post.title}`);
    if (ids.has(source.post.id)) throw new BlogError(`重复选择文章：${source.post.title}`);
    ids.add(source.post.id);
    const entry: ReleaseEntry = {
      id: source.post.id, slug: source.post.slug, title: source.post.title, category: source.post.category,
      sourcePath: source.sourcePath, revisionHash: source.revisionHash,
      publishedAt: old?.publishedAt ?? time, updatedAt: time, gitCommit: null,
      ...(source.post.series ? { series: source.post.series } : {}),
    };
    entries.set(entry.id, entry);
    retired.delete(entry.id);
  }
  for (const id of withdrawn) { if (!entries.has(id)) throw new BlogError(`撤回目标当前未发布：${id}`); retired.set(id, entries.get(id)!); entries.delete(id); }
  const slugs = new Set<string>();
  for (const entry of entries.values()) {
    const key = entry.slug.toLowerCase();
    if (slugs.has(key)) throw new BlogError(`候选清单 slug 冲突：${entry.slug}`);
    slugs.add(key);
  }
  const manifest: Manifest = {
    schemaVersion: 1, releaseId: `r-${randomUUID()}`, baseReleaseId: current?.releaseId ?? null,
    createdAt: time, codeHash: code.hash, codeCommit: code.commit,
    entries: [...entries.values()].sort((a, b) => a.id.localeCompare(b.id)),
    withdrawn: [...new Set([...(current?.withdrawn ?? []), ...withdrawn])].filter((id) => !entries.has(id)), retired: [...retired.values()],
    assets: Object.fromEntries(Object.entries(current?.assets ?? {}).filter(([id]) => entries.has(id) && !ids.has(id)).map(([id, assets]) => [id, structuredClone(assets)])),
  };
  // Only previously public references are retained. Prepared but never activated
  // release directories must never become an authorization source.
  const retained = new Map<string, NonNullable<Manifest['retainedResources']>[number]>();
  const keep = (ownerId: string, resource: NonNullable<Manifest['resources']>[number]) => {
    if (ownerId !== 'profile' && !entries.has(ownerId)) return;
    retained.set(`${ownerId}:${resource.projectId}:${resourceUrl(resource)}`, { ownerId, resource });
  };
  for (const item of current?.retainedResources ?? []) keep(item.ownerId, item.resource);
  const articleResources = new Set<string>();
  for (const [id, assets] of Object.entries(current?.assets ?? {})) for (const asset of Object.values(assets)) for (const resource of asset.resources ?? []) {
    articleResources.add(`${resource.projectId}:${resourceUrl(resource)}`);
    keep(id, resource);
  }
  for (const resource of current?.resources ?? []) if (!articleResources.has(`${resource.projectId}:${resourceUrl(resource)}`)) keep('profile', resource);
  if (retained.size) manifest.retainedResources = [...retained.values()];
  const catalogue = new Map((current?.series ?? []).map((entry) => [entry.id, { ...entry }]));
  const seriesChanges: NonNullable<Plan['seriesChanges']> = [];
  for (const source of selectedSeries) {
    const old = catalogue.get(source.series.id);
    if (old && old.slug !== source.series.slug) throw new BlogError(`已发布系列不能修改 slug：${source.series.title}`);
    if ([...catalogue.values()].some((entry) => entry.id !== source.series.id && entry.slug.toLowerCase() === source.series.slug.toLowerCase())) throw new BlogError(`系列 slug 冲突：${source.series.slug}`);
    catalogue.set(source.series.id, { id: source.series.id, slug: source.series.slug, title: source.series.title, category: source.series.category,
      revisionHash: source.revisionHash, publishedAt: old?.publishedAt ?? time, updatedAt: old?.revisionHash === source.revisionHash ? old.updatedAt : time });
    if (old?.revisionHash !== source.revisionHash) seriesChanges.push({ id: source.series.id, title: source.series.title, from: old?.revisionHash ?? null, to: source.revisionHash });
  }
  if (catalogue.size) manifest.series = [...catalogue.values()].sort((a, b) => a.id.localeCompare(b.id));
  validateSeriesMembers(manifest.entries, manifest.series ?? []);
  return { manifest, selected: [...ids], unchanged: manifest.entries.filter((e) => !ids.has(e.id)).map((e) => e.id), excluded: all.filter((s) => !entries.has(s.post.id)).map((s) => s.post.id), baselineChanged: !!current && current.codeHash !== code.hash,
    ...(selectedSeries.length ? { selectedSeries: selectedSeries.map((source) => source.series.id), seriesChanges } : {}) };
}

export function validateArticleLinks(manifest: Manifest, bodies: Array<{ id: string; body: string }>) {
  const ids = new Map(manifest.entries.map((entry) => [entry.id, entry.slug]));
  const slugs = new Set(manifest.entries.map((entry) => entry.slug));
  validateSeriesMembers(manifest.entries, manifest.series ?? []);
  const active = new Set(manifest.entries.flatMap((entry) => entry.series ? [entry.series.id] : []));
  const seriesSlugs = new Set((manifest.series ?? []).filter((entry) => active.has(entry.id)).map((entry) => entry.slug));
  for (const { id, body } of bodies) {
    for (const url of markdownReferences(body)) {
      if (url.startsWith('blog:') && !ids.has(url.slice(5).split('#')[0])) throw new BlogError(`文章 ${id} 引用了未发布的文章 ID：${url}`);
      const match = /^\/article\/([^/#?]+)\/?(?:[#?].*)?$/.exec(url);
      if (match && !slugs.has(match[1])) throw new BlogError(`文章 ${id} 引用了未发布的文章：${url}`);
      if (url.startsWith('series:') && !active.has(url.slice(7).split('#')[0])) throw new BlogError(`文章 ${id} 引用了未公开的系列：${url}`);
      const group = /^\/series\/([^/#?]+)\/?(?:[#?].*)?$/.exec(url);
      if (group && !seriesSlugs.has(group[1])) throw new BlogError(`文章 ${id} 引用了未公开的系列：${url}`);
    }
  }
}
export function articleStates(posts: SourcePost[], current: Manifest | null, verified: boolean) {
  const published = new Map((current?.entries ?? []).map((entry) => [entry.id, entry]));
  const states = posts.filter((source) => !source.post.fixture).map((source) => ({
    id: source.post.id, title: source.post.title, slug: source.post.slug, file: source.sourcePath,
    state: !verified ? 'unverified' : published.has(source.post.id)
      ? (published.get(source.post.id)!.revisionHash === source.revisionHash ? 'published' : 'modified')
      : current?.withdrawn.includes(source.post.id) ? 'withdrawn' : 'draft',
    revisionHash: source.revisionHash,
  }));
  for (const entry of published.values()) if (!posts.some((source) => source.post.id === entry.id)) states.push({ id: entry.id, title: entry.title, slug: entry.slug, file: entry.sourcePath, state: 'missing', revisionHash: entry.revisionHash });
  return states;
}
