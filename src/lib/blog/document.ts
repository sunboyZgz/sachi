import path from 'node:path';
import { parseDocument } from 'yaml';
import type { Root } from 'mdast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import { BlogError, sha256 } from './files';
import { categoryNames, categorySchema, flowSchema, postSchema } from './schema';

export function splitDocument(source: string) {
  const normalized = source.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) throw new BlogError('文章缺少 YAML frontmatter。');
  const delimiter = /\n---(?:\n|$)/g; delimiter.lastIndex = 4;
  const close = delimiter.exec(normalized);
  if (!close) throw new BlogError('frontmatter 缺少结束分隔符。');
  const end = close.index;
  const document = parseDocument(normalized.slice(4, end));
  if (document.errors.length) throw new BlogError(`YAML 无效：${document.errors[0].message}`);
  const data = document.toJSON() as Record<string, unknown>;
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new BlogError('frontmatter 必须是字段对象。');
  const originalOpening = /^(?:\uFEFF)?---\r?\n/.exec(source)!;
  const originalDelimiter = /\r?\n---(?:\r?\n|$)/g; originalDelimiter.lastIndex = originalOpening[0].length;
  const originalClose = originalDelimiter.exec(source)!;
  return { document, data, body: normalized.slice(end + close[0].length).trim(), bodyRaw: source.slice(originalClose.index + originalClose[0].length) };
}
export function dayInTimezone(value: string, timezone: string) {
  if (!Number.isFinite(Date.parse(value))) throw new BlogError(`时间无效：${value}`);
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function markdownReferences(body: string, options: { onIssue?: (message: string) => void } = {}) {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(body) as Root;
  const definitions = new Map<string, string>();
  visit(tree, 'definition', (node) => { definitions.set(node.identifier.toLowerCase(), node.url); });
  const urls: string[] = [];
  const report = (message: string) => {
    if (options.onIssue) options.onIssue(message);
    else throw new BlogError(message);
  };
  visit(tree, (node) => {
    if (node.type === 'image' || node.type === 'link') urls.push(node.url);
    if (node.type === 'imageReference' || node.type === 'linkReference') {
      const url = definitions.get(node.identifier.toLowerCase());
      if (!url) { report(`未定义的 Markdown 引用：${node.identifier}`); return; }
      urls.push(url);
    }
    if (node.type === 'html') report('不支持原始 HTML；图片或短视频请使用 ![说明](./assets/文件)。');
  });
  return [...new Set(urls)].sort();
}

export function imageReferences(body: string) {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(body) as Root;
  const definitions = new Map<string, string>();
  visit(tree, 'definition', (node) => { definitions.set(node.identifier.toLowerCase(), node.url); });
  const urls: string[] = [];
  visit(tree, (node) => {
    if (node.type === 'image') urls.push(node.url);
    if (node.type === 'imageReference') { const url = definitions.get(node.identifier.toLowerCase()); if (url) urls.push(url); }
  });
  return urls;
}

/** Shared identity and metadata adapter for the CLI, site and editor preview. */
export function postFromDocument(relative: string, data: Record<string, unknown>, body: string, timezone: string) {
  const legacy = !relative.endsWith('/index.md');
  const directoryCategory = Object.entries(categoryNames).find(([, name]) => name === relative.split('/')[0])?.[0];
  if (!legacy && !directoryCategory) throw new BlogError('文章必须放在三个固定栏目之一。');
  if (!legacy && data.category !== undefined && data.category !== directoryCategory) throw new BlogError('栏目以目录为准，请移除不一致的 category 字段。');
  const category = categorySchema.parse(legacy ? data.category : directoryCategory);
  if (!legacy && (typeof data.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.id))) throw new BlogError('缺少有效 UUID；使用 meta --init 补齐。');
  const id = legacy ? `legacy-${sha256(relative).slice(0, 24)}` : String(data.id);
  const createdAt = typeof data.createdAt === 'string' ? data.createdAt : `${String(data.date)}T12:00:00Z`;
  if (!legacy && !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(createdAt)) throw new BlogError('createdAt 必须是带时区的 ISO 时间。');
  const date = legacy ? String(data.date) : dayInTimezone(createdAt, timezone);
  const post = postSchema.parse({
    ...data, id, category, createdAt, date, body, publishedAt: undefined, updatedAt: undefined,
    slug: legacy ? path.basename(relative, '.md') : (data.slug ?? id),
    status: category === 'play' ? (data.status ?? '记录') : data.status,
    minutes: data.minutes ?? Math.max(1, Math.ceil(body.length / 400)),
    flow: data.flow === undefined ? undefined : flowSchema.parse(data.flow), assets: {},
  });
  dayInTimezone(`${post.date}T12:00:00Z`, timezone);
  if (!new Date(`${post.date}T12:00:00Z`).toISOString().startsWith(post.date)) throw new BlogError(`不存在的日历日期：${post.date}`);
  return post;
}
