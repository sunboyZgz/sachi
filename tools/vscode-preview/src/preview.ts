import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { isMap, isScalar, parseDocument } from 'yaml';
import { imageReferences, markdownReferences, postFromDocument, splitDocument } from '../../../src/lib/blog/document';
import { safeFile, sha256 } from '../../../src/lib/blog/files';
import { configSchema, defaultConfig, mediaSchema, flowSpecSchema, flowSpecs, type Asset } from '../../../src/lib/blog/schema';
import { profileSchema } from '../../../src/config/profile-schema';
import { profile } from '../../../src/config/profile';
import { parseMarkdown } from '../../../src/lib/markdown';
import { createSourceMapper } from '../../../src/lib/source-text-map';
import type { PreviewData, RevealLine } from './protocol';

export type ArticleLocation = { root: string; contentRoot: string; relative: string; file: string; legacy: boolean };
type BuildOptions = {
  location: ArticleLocation; raw: string; revision: number; dirty: boolean;
  resourceUri: (file: string) => string;
  readText?: (file: string) => Promise<string>;
  layoutMode?: 'responsive' | 'desktop'; documentVersion?: number; syncEnabled?: boolean; clickEnabled?: boolean; navigation?: RevealLine;
};
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);
const videoExtensions = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const fileExtensions = new Set([...imageExtensions, ...videoExtensions, '.pdf', '.txt', '.md', '.csv', '.json', '.zip']);
export const internalOrigin = 'https://sachi-preview.invalid';
export const internalLink = (target: string) => `${internalOrigin}/?target=${encodeURIComponent(target)}`;

export function articleLocation(root: string, file: string): ArticleLocation | null {
  for (const directory of ['content', 'tests/fixtures/content']) {
    const contentRoot = path.join(root, directory);
    const relative = path.relative(contentRoot, file).split(path.sep).join('/');
    if (/^[^/]+\.md$/.test(relative)) return { root, contentRoot, relative, file, legacy: true };
    if (/^(闲暇娱乐|生活旁白|蘸豆！！)\/\d{4}-\d{2}-\d{2}(?:-\d{2,})?\/index\.md$/.test(relative)) {
      return { root, contentRoot, relative, file, legacy: false };
    }
  }
  return null;
}

async function optionalText(file: string, readText: (file: string) => Promise<string>) {
  try { return await readText(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

/** Reads editor buffers and permitted local assets. Never writes content or publication state. */
export async function buildPreview(options: BuildOptions) {
  const { location, resourceUri } = options;
  const readText = options.readText ?? ((file: string) => readFile(file, 'utf8'));
  const configRaw = await optionalText(path.join(location.root, 'blog.config.json'), readText);
  const config = configRaw ? configSchema.parse(JSON.parse(configRaw)) : defaultConfig();
  const profileRaw = await optionalText(path.join(location.root, 'src/config/profile.json'), readText);
  const author = profileRaw ? profileSchema.parse(JSON.parse(profileRaw)) : profile;
  const warnings: string[] = [];
  const { data, body, bodyRaw, document: metadata } = splitDocument(options.raw);
  const titleKey = isMap(metadata.contents) ? metadata.contents.items.find((item) => isScalar(item.key) && item.key.value === 'title')?.key : undefined;
  const titleOffset = isScalar(titleKey) ? titleKey.range?.[0] : undefined;
  const title = typeof titleOffset === 'number' ? createSourceMapper(options.raw.replaceAll('\r\n', '\n').replace(/^\uFEFF/, ''), { lineOffset: 0 }).point(4 + titleOffset) : undefined;
  const bodyOffset = options.raw.length - bodyRaw.length + (bodyRaw.match(/^\s*/u)?.[0].length ?? 0);
  const beforeBody = options.raw.slice(0, bodyOffset);
  const origin = { lineOffset: (beforeBody.match(/\n/g) ?? []).length, columnOffset: beforeBody.length - beforeBody.lastIndexOf('\n') - 1 };
  const configs = data.flow === undefined ? [] : Array.isArray(data.flow) ? data.flow : [data.flow];
  if (Array.isArray(data.flow) && !configs.length) warnings.push('flow 数组为空，环绕暂用普通排版。');
  const valid = configs.flatMap((value, index) => {
    const result = flowSpecSchema.safeParse(value);
    if (result.success) return [result.data];
    warnings.push(`flow[${index + 1}] 环绕暂用普通排版：${result.error.message}`);
    return [];
  });
  const postFlow = Array.isArray(data.flow) ? valid.length ? valid : undefined : valid[0];
  let post = postFromDocument(location.relative, { ...data, flow: postFlow }, body, config.timezone);
  const specs = flowSpecs(post.flow);
  warnings.push(...parseMarkdown(body, post.flow, {}, origin, { tolerant: true }).warnings);
  const references = markdownReferences(body, { onIssue: (message) => { if (!warnings.includes(message)) warnings.push(message); } });
  const images = new Set([...imageReferences(body), post.cover, ...specs.flatMap((spec) => [spec.image, spec.contour])]);
  const mediaRaw = location.legacy ? undefined : await optionalText(path.join(path.dirname(location.file), 'media.yaml'), readText);
  let media = mediaSchema.parse({});
  if (mediaRaw) {
    try {
      const document = parseDocument(mediaRaw);
      if (document.errors.length) throw document.errors[0];
      media = mediaSchema.parse(document.toJSON());
    } catch (error) { warnings.push(`media.yaml：${error instanceof Error ? error.message : String(error)}`); }
  }
  const assets: Record<string, Asset> = {};
  const links = new Map<string, string>();
  const allowedExternal = new Set<string>();
  const referenced = [...references, post.cover, ...specs.flatMap((spec) => [spec.image, spec.contour])].filter((url): url is string => !!url);
  const posters = referenced.flatMap((url) => media.assets[url]?.poster ? [media.assets[url].poster!] : []);
  for (const url of [...new Set([...referenced, ...posters])]) {
    if (url.startsWith('#')) continue;
    if (/^(blog:|series:|\/article\/|\/series\/)/.test(url)) {
      assets[url] = { url: internalLink(url), type: 'file' };
      continue;
    }
    if (/^(https?:|mailto:|tel:)/i.test(url)) {
      if (images.has(url) || posters.includes(url)) {
        assets[url] = { url: '', type: 'image' };
        warnings.push(`${url}：图片、视频、封面与轮廓必须使用本篇本地资源。`);
      } else allowedExternal.add(url);
      continue;
    }
    // An unresolved resource must never fall through to an arbitrary file URI.
    assets[url] = { url: '', type: 'file' };
    try {
      const decoded = decodeURIComponent(url);
      if (decoded.includes('?') || decoded.includes('#') || decoded.includes('\\') || decoded.includes('\0')) throw new Error('本地资源不支持查询参数、片段或反斜杠。');
      const shared = location.legacy && /^\.?\/assets\//.test(decoded);
      if (!shared && !decoded.startsWith('./assets/')) throw new Error('资源必须位于本篇 ./assets/ 内。');
      const relative = decoded.replace(/^\.?\//, '');
      if (relative.split('/').some((part) => part.startsWith('.')) || !fileExtensions.has(path.extname(relative).toLowerCase())) throw new Error('不允许的附件路径或格式。');
      const base = shared ? path.join(location.root, 'public') : path.dirname(location.file);
      // Validate every ancestor from the project root, including the article directory.
      const file = await safeFile(location.root, path.relative(location.root, path.join(base, relative)).split(path.sep).join('/'));
      const info = await stat(file);
      const extension = path.extname(file).toLowerCase();
      const mapped = `${resourceUri(file)}?v=${info.mtimeMs}-${info.size}`;
      assets[url] = { url: mapped, type: videoExtensions.has(extension) ? 'video' : imageExtensions.has(extension) ? 'image' : 'file' };
      links.set(mapped, file);
    } catch (error) { warnings.push(`${url}：${error instanceof Error ? error.message : String(error)}`); }
  }
  for (const [url, preset] of Object.entries(media.assets)) {
    if (assets[url]?.type === 'video' && preset.poster) assets[url].poster = assets[preset.poster]?.url;
  }
  for (const spec of specs) if (!imageExtensions.has(path.extname(spec.image).toLowerCase()) || !assets[spec.image]?.url || spec.contour && !assets[spec.contour]?.url) {
    warnings.push(`${spec.image}：环绕图片或轮廓不可用，本区域暂用普通排版。`);
  }
  post = { ...post, assets, cover: post.cover ? assets[post.cover]?.url : undefined };
  const styles: string[] = [];
  for (const name of ['tokens.css', 'site.css', 'code-highlight.css', 'math.css']) {
    const file = path.join(location.root, 'src/styles', name);
    const info = await stat(file);
    styles.push(`${resourceUri(file)}?v=${info.mtimeMs}-${info.size}`);
  }
  let avatar = '';
  try {
    const file = await safeFile(location.root, 'src/assets/avatar/avatar-half.png');
    avatar = `${resourceUri(file)}?v=${sha256(await readFile(file))}`;
  } catch { warnings.push('项目半身头像不可用，使用插件构建时的头像。'); }
  const message: PreviewData = { type: 'update', layoutMode: options.layoutMode, revision: options.revision, document: location.file, dirty: options.dirty, post, profile: author, warnings, styles, avatar,
    source: { origin, version: options.documentVersion ?? 0, totalLines: options.raw.split('\n').length, syncEnabled: options.syncEnabled ?? true, clickEnabled: options.clickEnabled ?? true, title, navigation: options.navigation } };
  return { message, links, allowedExternal };
}

/** Link navigation is resolved only on a click, including draft targets in the current workspace. */
export async function findInternalTarget(location: ArticleLocation, target: string, readText: (file: string) => Promise<string>) {
  const [base, fragment] = target.split('#');
  const series = base.startsWith('series:') || base.startsWith('/series/');
  const files: string[] = [];
  if (series) {
    const directory = path.join(location.contentRoot, 'series');
    for (const entry of await readdir(directory, { withFileTypes: true })) if (entry.isFile() && entry.name.endsWith('.yaml')) files.push(path.join(directory, entry.name));
  } else {
    for (const entry of await readdir(location.contentRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(path.join(location.contentRoot, entry.name));
      if (entry.isDirectory() && ['闲暇娱乐', '生活旁白', '蘸豆！！'].includes(entry.name)) {
        for (const date of await readdir(path.join(location.contentRoot, entry.name), { withFileTypes: true })) {
          if (date.isDirectory() && /^\d{4}-\d{2}-\d{2}(?:-\d{2,})?$/.test(date.name)) files.push(path.join(location.contentRoot, entry.name, date.name, 'index.md'));
        }
      }
    }
  }
  for (const file of files) {
    try {
      await safeFile(location.root, path.relative(location.root, file).split(path.sep).join('/'));
      const raw = await readText(file);
      const data = series ? parseDocument(raw).toJSON() as Record<string, unknown> : splitDocument(raw).data;
      const article = articleLocation(location.root, file);
      const slug = series ? data.slug : article?.legacy ? path.basename(file, '.md') : data.slug ?? data.id;
      const id = !series && article?.legacy ? `legacy-${sha256(article.relative).slice(0, 24)}` : data.id;
      if (base === `${series ? 'series' : 'blog'}:${id}` || base === `/${series ? 'series' : 'article'}/${slug}/` || base === `/${series ? 'series' : 'article'}/${slug}`) return { file, fragment };
    } catch { /* An unfinished neighbouring draft does not block this preview. */ }
  }
  return null;
}
