import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { parseMarkdown } from '../markdown';
import { isContour } from '../flow-geometry';
import { BlogError, exists, safeFile, sha256, stableJson } from './files';
import { categoryNames, flowSpecs, mediaSchema, type BlogConfig, type BlogPost, type Dependency, type MediaSpec } from './schema';
import { scanSeries, validateSeriesMembers } from './series';
import { imageReferences, markdownReferences, postFromDocument, splitDocument } from './document';
export { dayInTimezone, markdownReferences, splitDocument } from './document';

export type SourcePost = {
  post: BlogPost; sourcePath: string; directory: string; raw: string;
  dependencies: Array<Dependency & { sourceFile: string }>;
  media: MediaSpec; revisionHash: string; warnings: string[]; links: string[];
};
const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.mp4', '.webm', '.mov', '.m4v', '.pdf', '.txt', '.md', '.csv', '.json', '.zip']);

export async function readSourcePost(root: string, sourcePath: string, config: BlogConfig, contentDir: string = config.contentDir): Promise<SourcePost> {
  const contentRoot = path.join(root, contentDir);
  const relative = sourcePath.replace(/^content\//, '');
  const file = await safeFile(contentRoot, relative);
  const raw = await readFile(file, 'utf8');
  const { data, body, bodyRaw } = splitDocument(raw);
  const legacy = !relative.endsWith('/index.md');
  const directory = path.dirname(file);
  const post = postFromDocument(relative, data, body, config.timezone);
  const beforeBody = raw.slice(0, raw.length - bodyRaw.length + (bodyRaw.match(/^\s*/u)?.[0].length ?? 0));
  const parsed = parseMarkdown(body, post.flow, {}, { lineOffset: (beforeBody.match(/\n/g) ?? []).length, columnOffset: beforeBody.length - beforeBody.lastIndexOf('\n') - 1 }, { type: post.type });
  const specs = flowSpecs(post.flow);
  for (const spec of specs) if (!/\.(?:png|jpe?g|webp|avif|svg|gif)$/i.test(spec.image)) throw new BlogError(`flow.image 必须是本篇的静态图片：${spec.image}`);
  if (!legacy && await exists(path.join(directory, 'layout.yaml'))) throw new BlogError('使用 frontmatter.flow 配置环绕，不支持第二份 layout.yaml。');
  const mediaFile = path.join(directory, 'media.yaml');
  const parsedMedia = !legacy && await exists(mediaFile)
    ? mediaSchema.parse(parseDocument(await readFile(await safeFile(directory, 'media.yaml'), 'utf8')).toJSON())
    : mediaSchema.parse({});
  const urls = markdownReferences(body);
  const links = urls.filter((url) => url.startsWith('/article/') || url.startsWith('blog:') || url.startsWith('/series/') || url.startsWith('series:'));
  const resourceUrls = [...urls, post.cover, ...specs.flatMap((spec) => [spec.image, spec.contour])].filter((url): url is string => !!url);
  const media = { assets: Object.fromEntries(Object.entries(parsedMedia.assets).filter(([url]) => resourceUrls.includes(url))) };
  const resources = [...resourceUrls, ...Object.values(media.assets).map((p) => p.poster)].filter((url): url is string => !!url);
  for (const url of [...imageReferences(body), post.cover, ...specs.flatMap((spec) => [spec.image, spec.contour]), ...Object.values(media.assets).map((p) => p.poster)].filter((url): url is string => !!url)) {
    if (/^(?:https?:|\/\/)/i.test(url)) throw new BlogError(`图片、视频和封面必须使用本篇本地资源，才能冻结旧版：${url}`);
  }
  const dependencies: SourcePost['dependencies'] = [];
  const normalizedAssets = new Map<string, string>();
  const warnings: string[] = [...parsed.warnings];
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
    if (specs.some((spec) => url === spec.contour)) {
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
      if (date.isFile() && ['.DS_Store', '.gitkeep'].includes(date.name)) continue;
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
