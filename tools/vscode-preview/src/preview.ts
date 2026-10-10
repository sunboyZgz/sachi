import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { imageReferences, markdownReferences, postFromDocument, splitDocument } from '../../../src/lib/blog/document';
import { safeFile, sha256 } from '../../../src/lib/blog/files';
import { configSchema, defaultConfig, mediaSchema, type Asset } from '../../../src/lib/blog/schema';
import { profileSchema } from '../../../src/config/profile-schema';
import { profile } from '../../../src/config/profile';
import { parseMarkdown } from '../../../src/lib/markdown';
import type { PreviewData } from './protocol';

export type ArticleLocation = { root: string; contentRoot: string; relative: string; file: string; legacy: boolean };
type BuildOptions = {
  location: ArticleLocation; raw: string; revision: number; dirty: boolean;
  resourceUri: (file: string) => string;
  readText?: (file: string) => Promise<string>;
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
  const { data, body } = splitDocument(options.raw);
  let post;
  try { post = postFromDocument(location.relative, data, body, config.timezone); }
  catch (error) {
    if (data.flow === undefined) throw error;
    // Other invalid metadata still fails on the second pass, while partial flow keeps the full body.
    post = postFromDocument(location.relative, { ...data, flow: undefined }, body, config.timezone);
    warnings.push(`环绕暂用普通排版：${error instanceof Error ? error.message : String(error)}`);
  }
  try { parseMarkdown(body, post.flow); }
  catch (error) {
    warnings.push(`环绕暂用普通排版：${error instanceof Error ? error.message : String(error)}`);
    post = { ...post, flow: undefined };
  }
  const references = markdownReferences(body, { onIssue: (message) => { if (!warnings.includes(message)) warnings.push(message); } });
  const images = new Set([...imageReferences(body), post.cover, post.flow?.image, post.flow?.contour]);
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
  const referenced = [...references, post.cover, post.flow?.image, post.flow?.contour].filter((url): url is string => !!url);
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
  if (post.flow && (!imageExtensions.has(path.extname(post.flow.image).toLowerCase()) || !assets[post.flow.image]?.url || post.flow.contour && !assets[post.flow.contour]?.url)) {
    warnings.push('环绕图片或轮廓不可用，暂用普通排版。');
    post = { ...post, flow: undefined };
  }
  post = { ...post, assets, cover: post.cover ? assets[post.cover]?.url : undefined,
    flow: post.flow ? { ...post.flow, image: assets[post.flow.image].url, contour: post.flow.contour ? assets[post.flow.contour].url : undefined } : undefined };
  const styles: string[] = [];
  for (const name of ['tokens.css', 'site.css']) {
    const file = path.join(location.root, 'src/styles', name);
    const info = await stat(file);
    styles.push(`${resourceUri(file)}?v=${info.mtimeMs}-${info.size}`);
  }
  let avatar = '';
  try {
    const file = await safeFile(location.root, 'src/assets/avatar/avatar-half.png');
    avatar = `${resourceUri(file)}?v=${sha256(await readFile(file))}`;
  } catch { warnings.push('项目半身头像不可用，使用插件构建时的头像。'); }
  const message: PreviewData = { type: 'update', revision: options.revision, document: location.file, dirty: options.dirty, post, profile: author, warnings, styles, avatar };
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
