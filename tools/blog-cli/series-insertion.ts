import { splitDocument } from '../../src/lib/blog/document';
import { BlogError, sha256, stableJson } from '../../src/lib/blog/files';
import { postSchema, seriesRefSchema, type BlogConfig, type BlogPost } from '../../src/lib/blog/schema';
import { scanSeries, validateSeriesMembers } from '../../src/lib/blog/series';
import { articleCatalogue, type ArticleIdentity } from './catalogue';
import { cachedManifest } from './state';
import { applyWritingTransaction, assertNoPendingWrites, type FileChange } from './writing-transactions';

export type InsertionChange = { id: string; title: string; file: string; from: BlogPost['series'] | null; to: NonNullable<BlogPost['series']> };
export type InsertionResult = {
  articleId: string; articleTitle: string; seriesId: string; seriesTitle: string; order: number;
  changes: InsertionChange[]; publishTogether: string[]; publishedBasisAt: string | null;
};
export type InsertionPlan = { result: InsertionResult; files: FileChange[]; fingerprint: string };

function assign(source: ArticleIdentity, membership: NonNullable<BlogPost['series']>): FileChange {
  const { document, bodyRaw } = splitDocument(source.raw);
  if (source.series) document.setIn(['series', 'order'], membership.order);
  else document.set('series', membership);
  const eol = source.raw.includes('\r\n') ? '\r\n' : '\n';
  return { file: source.file, before: source.raw,
    after: `${source.raw.startsWith('\uFEFF') ? '\uFEFF' : ''}---${eol}${document.toString().replaceAll('\n', eol)}---${eol}${bodyRaw}` };
}

export async function prepareSeriesInsertion(root: string, _config: BlogConfig, articleId: string, seriesId: string, order: number): Promise<InsertionPlan> {
  await assertNoPendingWrites(root);
  postSchema.shape.id.parse(articleId);
  const membership = seriesRefSchema.parse({ id: seriesId, order });
  const catalogue = await articleCatalogue(root);
  const groups = await scanSeries(root);
  if (catalogue.issues.length || groups.issues.length) throw new BlogError('文章身份或系列资料存在问题，未修改文件。', 3, 'INVALID', [...catalogue.issues, ...groups.issues]);
  const found = catalogue.articles.filter((source) => source.id.toLowerCase() === articleId.toLowerCase());
  if (found.length !== 1) throw new BlogError(`找不到唯一文章 ID：${articleId}。请先运行 search 查找完整 ID。`, 2);
  const article = found[0];
  if (article.series) {
    const old = groups.series.find((source) => source.series.id === article.series!.id);
    throw new BlogError(`文章「${article.title}」已经属于系列「${old?.series.title ?? article.series.id}」（${article.series.id}），拒绝重复加入。`, 3, 'ALREADY_IN_SERIES');
  }
  const group = groups.series.find((source) => source.series.id.toLowerCase() === seriesId.toLowerCase());
  if (!group) throw new BlogError(`找不到系列 ID：${seriesId}。请先运行 series search 查找完整 ID。`, 2);
  if (article.category !== group.series.category) throw new BlogError('文章和系列必须属于同一栏目。');
  membership.id = group.series.id;
  const { manifest, checkedAt } = await cachedManifest(root);
  const localIds = new Set(catalogue.articles.map((source) => source.id.toLowerCase()));
  const retained = (manifest?.entries ?? []).filter((entry) => !localIds.has(entry.id.toLowerCase()));
  if (retained.some((entry) => entry.series?.id === group.series.id && entry.series.order >= order)) throw new BlogError('需要顺延的公开章节缺少本地源文件，请先恢复这些文章。', 4, 'SOURCE_MISSING', retained.filter((entry) => entry.series?.id === group.series.id && entry.series.order >= order).map((entry) => ({ id: entry.id, title: entry.title, file: entry.sourcePath })));
  validateSeriesMembers([...catalogue.articles, ...retained], groups.series.map((source) => source.series));
  const shifted = catalogue.articles.filter((source) => source.series?.id === group.series.id && source.series.order >= order)
    .sort((a, b) => b.series!.order - a.series!.order);
  const changes: InsertionChange[] = shifted.map((source) => ({ id: source.id, title: source.title, file: source.file, from: source.series!,
    to: seriesRefSchema.parse({ id: group.series.id, order: source.series!.order + 1 }) }));
  changes.push({ id: article.id, title: article.title, file: article.file, from: null, to: membership });
  const changed = new Map(changes.map((entry) => [entry.id, entry.to]));
  validateSeriesMembers([...catalogue.articles.map((source) => ({ ...source, series: changed.get(source.id) ?? source.series })), ...retained], groups.series.map((source) => source.series));
  const files = changes.map((change) => assign(catalogue.articles.find((source) => source.id === change.id)!, change.to));
  const publicIds = new Set((manifest?.entries ?? []).map((entry) => entry.id));
  const result: InsertionResult = { articleId: article.id, articleTitle: article.title, seriesId: group.series.id, seriesTitle: group.series.title, order,
    changes, publishTogether: [article.id, ...changes.filter((change) => change.id !== article.id && publicIds.has(change.id)).map((change) => change.id)], publishedBasisAt: checkedAt };
  const fingerprint = sha256(stableJson({ identities: catalogue.articles.map(({ id, category, file, series }) => ({ id, category, file, series })),
    files: files.map((entry) => ({ file: entry.file, hash: sha256(entry.before) })), series: group.raw, manifest }));
  return { result, files, fingerprint };
}

export function describeInsertion(result: InsertionResult) {
  return [`将「${result.articleTitle}」加入「${result.seriesTitle}」第 ${result.order} 章：`,
    ...result.changes.map((change) => `${change.title} · ${change.id}\n  ${change.from?.order ?? '普通文章'} → ${change.to.order} · ${change.file}`),
    `仅修改本地归属；公开修订需明确选择文章：${result.publishTogether.join(' ')}`].join('\n');
}

/** Caller owns writing.lock across confirmation, revalidation and the transaction. */
export async function commitSeriesInsertion(root: string, config: BlogConfig, plan: InsertionPlan, write?: Parameters<typeof applyWritingTransaction>[2]) {
  const fresh = await prepareSeriesInsertion(root, config, plan.result.articleId, plan.result.seriesId, plan.result.order);
  if (fresh.fingerprint !== plan.fingerprint) throw new BlogError('确认后文章或系列资料发生变化，未执行系列插入。', 4);
  const transaction = await applyWritingTransaction(root, fresh.files, write);
  return { ...fresh.result, transaction };
}
