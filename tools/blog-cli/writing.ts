import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Document, parse as parseYaml } from 'yaml';
import { dayInTimezone, splitDocument } from '../../src/lib/blog/content';
import { BlogError, atomicWrite, exists, inside, safeDirectory, safeFile, sha256 } from '../../src/lib/blog/files';
import { categoryNames, postSchema, defaultConfig, type BlogConfig, type BlogPost } from '../../src/lib/blog/schema';
import { scanSeries, validateSeriesMembers } from '../../src/lib/blog/series';
import { scanContent } from '../../src/lib/blog/content';
import { assertNoPendingWrites } from './writing-transactions';

export async function newPost(root: string, config: BlogConfig, values: { category: string; title: string; slug?: string; now?: Date; series?: BlogPost['series'] }) {
  await assertNoPendingWrites(root);
  const category = Object.entries(categoryNames).find(([id, name]) => id === values.category || name === values.category);
  if (!category || !values.title.trim()) throw new BlogError('必须提供有效栏目和非空标题。', 2);
  const id = randomUUID(); const now = values.now ?? new Date();
  postSchema.shape.slug.parse(values.slug ?? id);
  const createdAt = now.toISOString(); const day = dayInTimezone(createdAt, config.timezone);
  const templateFile = path.join(root, 'templates', 'post.md');
  const template = await exists(templateFile) ? await readFile(await safeFile(path.join(root, 'templates'), 'post.md'), 'utf8') : '## 开始\n\n在这里写正文。\n';
  const parsedTemplate = /^(?:\uFEFF)?---\r?\n/.test(template) ? splitDocument(template) : null;
  const document = parsedTemplate?.document ?? new Document({ tags: [] });
  for (const field of ['category', 'fixture', 'date', 'series']) document.delete(field);
  if (values.series) document.set('series', postSchema.shape.series.parse(values.series));
  document.set('id', id); document.set('title', values.title.trim()); document.set('slug', values.slug ?? id); document.set('createdAt', createdAt);
  if (category[0] === 'play' && !document.has('status')) document.set('status', '记录');
  const body = parsedTemplate?.bodyRaw ?? template;
  const templateData = document.toJSON();
  postSchema.parse({ ...templateData, category: category[0], date: day, body, assets: {}, minutes: templateData.minutes ?? Math.max(1, Math.ceil(body.length / 400)) });
  const source = `---\n${document.toString()}---\n\n${body}`;
  const parent = await safeDirectory(root, `content/${category[1]}`);
  let directory = '';
  for (let index = 1; index < 10000; index++) {
    const candidate = path.join(parent, `${day}${index === 1 ? '' : `-${String(index).padStart(2, '0')}`}`);
    try { await mkdir(candidate); directory = candidate; break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  if (!directory) throw new BlogError('同日文章目录已达到上限。');
  await mkdir(path.join(directory, 'assets'));
  await writeFile(path.join(directory, 'index.md'), source, { flag: 'wx' });
  return { id, slug: values.slug ?? id, file: path.relative(root, path.join(directory, 'index.md')), url: `/article/${values.slug ?? id}/` };
}

export async function editMeta(root: string, selector: string, changes: Record<string, unknown>, initialize = false, config: BlogConfig = defaultConfig()) {
  await assertNoPendingWrites(root);
  const relative = selector.replace(/\/$/, '').replace(/^\.\//, '');
  const contentRoot = path.join(root, 'content');
  const relativeFile = relative.replace(/^content\//, '') + (relative.endsWith('.md') ? '' : '/index.md');
  const file = inside(contentRoot, relativeFile);
  if (!await exists(file)) throw new BlogError(`找不到主文档：${selector}`);
  await safeFile(contentRoot, relativeFile);
  const original = await readFile(file, 'utf8');
  const { document, data, bodyRaw } = splitDocument(original);
  if (initialize && !data.id) document.set('id', randomUUID());
  if (initialize && !data.createdAt) document.set('createdAt', new Date().toISOString());
  const allowed = new Set(['title', 'tags', 'summary', 'cover', 'status', 'minutes', 'featured', 'flow', 'slug', 'series']);
  for (const [field, value] of Object.entries(changes)) {
    if (!allowed.has(field)) throw new BlogError(`不能通过 meta 修改字段：${field}`, 2);
    if (value === null && ['title', 'slug'].includes(field)) throw new BlogError(`不能删除 ${field}。`, 2);
    if (value !== null) postSchema.shape[field as keyof typeof postSchema.shape].parse(value);
    if (value === null) document.delete(field); else document.set(field, value);
  }
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const updated = `${original.startsWith('\uFEFF') ? '\uFEFF' : ''}---${eol}${document.toString().replaceAll('\n', eol)}---${eol}${bodyRaw}`;
  if (Object.hasOwn(changes, 'series')) {
    const next = document.toJSON();
    const category = Object.entries(categoryNames).find(([, name]) => name === relativeFile.split('/')[0])?.[0] ?? next.category;
    const id = next.id ?? `legacy-${sha256(relativeFile).slice(0, 24)}`;
    const catalogue = await scanSeries(root);
    if (catalogue.issues.length) throw new BlogError(JSON.stringify(catalogue.issues));
    const peers = (await scanContent(root, config)).posts.map((item) => item.post).filter((post) => post.id !== id);
    const { publishedChapters } = await import('./series');
    const published = await publishedChapters(root);
    const retained = published.filter((post) => post.id !== id && !peers.some((item) => item.id === post.id));
    validateSeriesMembers([...peers, ...retained, { id, title: next.title, category, series: next.series }], catalogue.series.map((item) => item.series));
  }
  if (await readFile(file, 'utf8') !== original) throw new BlogError('文章在元数据编辑期间发生变化，未覆盖。', 4);
  await atomicWrite(file, updated);
  return document.toJSON();
}
export function parseAssignments(values: string[]) {
  return Object.fromEntries(values.map((value) => {
    const index = value.indexOf('=');
    if (index < 1) throw new BlogError('--set 使用 字段=YAML值，例如 tags=[学习,记录]。', 2);
    return [value.slice(0, index), parseYaml(value.slice(index + 1))];
  }));
}
