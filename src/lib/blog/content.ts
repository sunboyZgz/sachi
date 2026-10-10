import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';
import type { Root } from 'mdast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { parseMarkdown } from '../markdown';
import { isContour } from '../flow-geometry';
import { BlogError, exists, safeFile, sha256, stableJson } from './files';
import { categoryNames, categorySchema, flowSchema, mediaSchema, postSchema, type BlogConfig, type BlogPost, type Dependency, type MediaSpec } from './schema';
import { scanSeries, validateSeriesMembers } from './series';

export type SourcePost = {
  post: BlogPost; sourcePath: string; directory: string; raw: string;
  dependencies: Array<Dependency & { sourceFile: string }>;
  media: MediaSpec; revisionHash: string; warnings: string[]; links: string[];
};
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
export function markdownReferences(body: string) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const definitions = new Map<string, string>();
  visit(tree, 'definition', (node) => { definitions.set(node.identifier.toLowerCase(), node.url); });
  const urls: string[] = [];
  visit(tree, (node) => {
    if (node.type === 'image' || node.type === 'link') urls.push(node.url);
    if (node.type === 'imageReference' || node.type === 'linkReference') {
      const url = definitions.get(node.identifier.toLowerCase());
      if (!url) throw new BlogError(`未定义的 Markdown 引用：${node.identifier}`);
      urls.push(url);
    }
    if (node.type === 'html') throw new BlogError('不支持原始 HTML；图片或短视频请使用 ![说明](./assets/文件)。');
  });
  return [...new Set(urls)].sort();
}
function imageReferences(body: string) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const definitions = new Map<string, string>();
  visit(tree, 'definition', (node) => { definitions.set(node.identifier.toLowerCase(), node.url); });
  const urls: string[] = [];
  visit(tree, (node) => {
    if (node.type === 'image') urls.push(node.url);
    if (node.type === 'imageReference') { const url = definitions.get(node.identifier.toLowerCase()); if (url) urls.push(url); }
  });
  return urls;
}
const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.mp4', '.webm', '.mov', '.m4v', '.pdf', '.txt', '.md', '.csv', '.json', '.zip']);

export async function readSourcePost(root: string, sourcePath: string, config: BlogConfig, contentDir: string = config.contentDir): Promise<SourcePost> {
  const contentRoot = path.join(root, contentDir);
  const relative = sourcePath.replace(/^content\//, '');
  const file = await safeFile(contentRoot, relative);
  const raw = await readFile(file, 'utf8');
  const { data, body } = splitDocument(raw);
  const legacy = !relative.endsWith('/index.md');
  const directory = path.dirname(file);
  const directoryCategory = Object.entries(categoryNames).find(([, name]) => name === relative.split('/')[0])?.[0];
  if (!legacy && !directoryCategory) throw new BlogError('文章必须放在三个固定栏目之一。');
  if (!legacy && data.category !== undefined && data.category !== directoryCategory) throw new BlogError('栏目以目录为准，请移除不一致的 category 字段。');
  const category = categorySchema.parse(legacy ? data.category : directoryCategory);
  if (!legacy && (typeof data.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(data.id))) throw new BlogError('缺少有效 UUID；使用 meta --init 补齐。');
  const id = legacy ? `legacy-${sha256(relative).slice(0, 24)}` : String(data.id);
  const createdAt = typeof data.createdAt === 'string' ? data.createdAt : `${String(data.date)}T12:00:00Z`;
  if (!legacy && !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(createdAt)) throw new BlogError('createdAt 必须是带时区的 ISO 时间。');
  const date = legacy ? String(data.date) : dayInTimezone(createdAt, config.timezone);
  const post = postSchema.parse({
    ...data, id, category, createdAt, date, body, publishedAt: undefined, updatedAt: undefined,
    slug: legacy ? path.basename(relative, '.md') : (data.slug ?? id),
    status: category === 'play' ? (data.status ?? '记录') : data.status,
    minutes: data.minutes ?? Math.max(1, Math.ceil(body.length / 400)),
    flow: data.flow === undefined ? undefined : flowSchema.parse(data.flow), assets: {},
  });
  dayInTimezone(`${post.date}T12:00:00Z`, config.timezone);
  if (!new Date(`${post.date}T12:00:00Z`).toISOString().startsWith(post.date)) throw new BlogError(`不存在的日历日期：${post.date}`);
  parseMarkdown(body, post.flow);
  if (post.flow && !/\.(?:png|jpe?g|webp|avif|svg|gif)$/i.test(post.flow.image)) throw new BlogError('flow.image 必须是本篇的静态图片。');
  if (!legacy && await exists(path.join(directory, 'layout.yaml'))) throw new BlogError('使用 frontmatter.flow 配置环绕，不支持第二份 layout.yaml。');
  const mediaFile = path.join(directory, 'media.yaml');
  const parsedMedia = !legacy && await exists(mediaFile)
    ? mediaSchema.parse(parseDocument(await readFile(await safeFile(directory, 'media.yaml'), 'utf8')).toJSON())
    : mediaSchema.parse({});
  const urls = markdownReferences(body);
  const links = urls.filter((url) => url.startsWith('/article/') || url.startsWith('blog:') || url.startsWith('/series/') || url.startsWith('series:'));
  const resourceUrls = [...urls, post.cover, post.flow?.image, post.flow?.contour].filter((url): url is string => !!url);
  const media = { assets: Object.fromEntries(Object.entries(parsedMedia.assets).filter(([url]) => resourceUrls.includes(url))) };
  const resources = [...resourceUrls, ...Object.values(media.assets).map((p) => p.poster)].filter((url): url is string => !!url);
  for (const url of [...imageReferences(body), post.cover, post.flow?.image, post.flow?.contour, ...Object.values(media.assets).map((p) => p.poster)].filter((url): url is string => !!url)) {
    if (/^(?:https?:|\/\/)/i.test(url)) throw new BlogError(`图片、视频和封面必须使用本篇本地资源，才能冻结旧版：${url}`);
  }
  const dependencies: SourcePost['dependencies'] = [];
  const normalizedAssets = new Map<string, string>();
  const warnings: string[] = [];
  for (const url of [...new Set(resources)].sort()) {
    if (/^(https?:|mailto:|tel:|#)/i.test(url) || links.includes(url)) continue;
    if (/^[a-z]+:/i.test(url) || url.startsWith('//')) throw new BlogError(`不允许的资源协议：${url}`);
    const decoded = decodeURIComponent(url);
    if (decoded.includes('?') || decoded.includes('#')) throw new BlogError(`本地附件不支持查询参数或片段：${url}`);
    const shared = legacy && (decoded.startsWith('/assets/') || decoded.startsWith('./assets/'));
    if (!shared && !decoded.startsWith('./assets/')) throw new BlogError(`资源必须位于本篇文章 ./assets/ 内：${url}`);
    const local = shared ? decoded.replace(/^\.?\//, '') : decoded.slice(2);
    const normalized = local.normalize('NFC').toLowerCase();
    if (normalizedAssets.has(normalized) && normalizedAssets.get(normalized) !== local) throw new BlogError(`资源路径大小写或 Unicode 冲突：${local}`);
    normalizedAssets.set(normalized, local);
    if (local.split('/').some((part) => part.startsWith('.')) || !allowed.has(path.extname(local).toLowerCase())) throw new BlogError(`不允许公开的附件：${url}`);
    const sourceFile = await safeFile(shared ? path.join(root, 'public') : directory, local);
    const bytes = await readFile(sourceFile);
    if (bytes.length > config.media.maxGitFileMiB * 1024 ** 2) throw new BlogError(`源文件超过 ${config.media.maxGitFileMiB} MiB：${url}`);
    if (bytes.length > 50 * 1024 ** 2) warnings.push(`源文件超过 50 MiB：${url}`);
    if (url === post.flow?.contour) {
      if (!isContour(JSON.parse(bytes.toString()))) throw new BlogError(`环绕轮廓无效：${url}`);
    }
    dependencies.push({ url, file: local, sourceFile, hash: sha256(bytes), bytes: bytes.length });
  }
  const semantic = { post, media, dependencies: dependencies.map(({ url, file, hash, bytes }) => ({ url, file, hash, bytes })) };
  return { post, sourcePath, directory, raw, dependencies, media, revisionHash: sha256(stableJson(semantic)), warnings, links };
}

export async function scanContent(root: string, config: BlogConfig, contentDir: string = config.contentDir) {
  const base = path.join(root, contentDir);
  const files: string[] = [];
  const issues: Array<{ file: string; message: string }> = [];
  if (!await exists(base)) return { posts: [] as SourcePost[], issues };
  for (const item of await readdir(base, { withFileTypes: true })) {
    if (item.isSymbolicLink()) { issues.push({ file: item.name, message: '不允许符号链接。' }); continue; }
    if (item.isFile() && item.name.endsWith('.md')) files.push(`content/${item.name}`);
    if (!item.isDirectory() || !Object.values(categoryNames).includes(item.name as typeof categoryNames.play)) continue;
    for (const date of await readdir(path.join(base, item.name), { withFileTypes: true })) {
      if (!date.isDirectory() || !/^\d{4}-\d{2}-\d{2}(?:-\d{2,})?$/.test(date.name)) {
        issues.push({ file: `content/${item.name}/${date.name}`, message: '日期目录无效或不是普通目录。' }); continue;
      }
      files.push(`content/${item.name}/${date.name}/index.md`);
    }
  }
  const normalizedPaths = new Map<string, string>();
  const posts: SourcePost[] = [];
  for (const file of files.sort()) {
    const key = file.normalize('NFC').toLowerCase();
    if (normalizedPaths.has(key)) { issues.push({ file, message: `跨平台路径冲突：${normalizedPaths.get(key)}` }); continue; }
    normalizedPaths.set(key, file);
    try { posts.push(await readSourcePost(root, file, config, contentDir)); }
    catch (error) { issues.push({ file, message: error instanceof Error ? error.message : String(error) }); }
  }
  for (const field of ['id', 'slug'] as const) {
    const seen = new Map<string, string>();
    for (const source of posts) {
      const key = source.post[field].toLowerCase();
      if (seen.has(key)) issues.push({ file: source.sourcePath, message: `${field} 重复：${seen.get(key)}` });
      seen.set(key, source.sourcePath);
    }
  }
  const catalogue = await scanSeries(root, contentDir);
  issues.push(...catalogue.issues);
  try { validateSeriesMembers(posts.map((source) => source.post), catalogue.series.map((source) => source.series)); }
  catch (error) { issues.push({ file: contentDir, message: error instanceof Error ? error.message : String(error) }); }
  return { posts, issues };
}
export function selectPosts(posts: SourcePost[], selectors: string[], options: { allowFixtures?: boolean } = {}) {
  return selectors.map((selector) => {
    const normalized = selector.replaceAll('\\', '/').replace(/\/$/, '').replace(/^\.\//, '');
    const found = posts.find(({ post, sourcePath }) => post.id === selector || post.slug === selector || sourcePath === normalized || sourcePath.replace(/\/index.md$/, '') === normalized);
    if (!found) throw new BlogError(`找不到文章：${selector}`);
    if (found.post.fixture && !options.allowFixtures) throw new BlogError('排版 fixture 不能发布；请新建正式文章。');
    return found;
  });
}
