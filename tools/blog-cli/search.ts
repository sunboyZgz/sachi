import Fuse from 'fuse.js';
import { scanSeries } from '../../src/lib/blog/series';
import { BlogError } from '../../src/lib/blog/files';
import { articleCatalogue } from './catalogue';

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
type NamedIdentity = { id: string; title: string; category: string; file: string };

export function findNames<T extends NamedIdentity>(items: T[], query: string): T[] {
  const normalized = normalize(query);
  if (!normalized) throw new BlogError('请提供非空中文名称或关键词。', 2, 'INPUT_REQUIRED');
  const terms = normalized.split(' ');
  const index = new Fuse(items.map((item) => ({ item, name: normalize(item.title) })), {
    keys: ['name'], ignoreLocation: true, threshold: 0.35, includeScore: true, ignoreFieldNorm: true,
  });
  const matches = index.search(terms.length === 1 ? normalized : { $and: terms.map((term) => ({ name: term })) });
  const rank = (name: string) => name === normalized ? 0 : terms.every((term) => name.includes(term)) ? 1 : 2;
  return matches.sort((a, b) => rank(a.item.name) - rank(b.item.name) || (a.score ?? 1) - (b.score ?? 1)
    || (a.item.item.file < b.item.item.file ? -1 : a.item.item.file > b.item.item.file ? 1 : 0)).map((match) => match.item.item);
}

export async function searchNames(root: string, kind: 'article' | 'series', query: string) {
  // Validate before scanning; queries never trigger media checks or network access.
  findNames([], query);
  if (kind === 'article') {
    const catalogue = await articleCatalogue(root);
    const identities = catalogue.articles.map(({ id, title, category, file, series }) => ({ id, title, category, file, ...(series ? { series } : {}) }));
    return { kind, query, matches: findNames(identities, query), issues: catalogue.issues };
  }
  const catalogue = await scanSeries(root);
  const identities = catalogue.series.map((source) => ({ id: source.series.id, title: source.series.title, category: source.series.category, file: source.sourcePath }));
  return { kind, query, matches: findNames(identities, query), issues: catalogue.issues };
}
