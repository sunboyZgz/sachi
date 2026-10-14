import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { splitDocument } from '../../src/lib/blog/document';
import { BlogError, exists, safeFile, sha256 } from '../../src/lib/blog/files';
import { categoryNames, categorySchema, postSchema, seriesRefSchema, type BlogPost } from '../../src/lib/blog/schema';

export function matchingArticles(root: string, articles: ArticleIdentity[], selector: string) {
  const file = (path.isAbsolute(selector) ? path.relative(root, selector) : selector).replace(/^\.\//, '').split(path.sep).join('/').replace(/\/$/, '');
  return articles.filter((source) => {
    const { data } = splitDocument(source.raw);
    const slug = source.file.endsWith('/index.md') ? data.slug ?? source.id : path.basename(source.file, '.md');
    return source.id.toLowerCase() === selector.toLowerCase() || slug === selector || source.file === file || source.file.replace(/\/index.md$/, '') === file;
  });
}

export type ArticleIdentity = {
  id: string; title: string; category: BlogPost['category']; file: string; raw: string;
  series?: BlogPost['series'];
};
export type CatalogueIssue = { file: string; message: string };

/** Writing identities are independent of incomplete body syntax, flow and media. */
export async function articleCatalogue(root: string) {
  const base = path.join(root, 'content');
  const articles: ArticleIdentity[] = [];
  const issues: CatalogueIssue[] = [];
  const files: string[] = [];
  if (!await exists(base)) return { articles, issues };
  if ((await lstat(base)).isSymbolicLink()) throw new BlogError('文章目录不能是符号链接。');
  for (const item of await readdir(base, { withFileTypes: true })) {
    if (item.isSymbolicLink()) { issues.push({ file: `content/${item.name}`, message: '不允许符号链接。' }); continue; }
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
  const paths = new Set<string>();
  const ids = new Set<string>();
  for (const file of files.sort()) {
    try {
      const normalizedPath = file.normalize('NFC').toLowerCase();
      if (paths.has(normalizedPath)) throw new BlogError('跨平台路径冲突。');
      paths.add(normalizedPath);
      const raw = await readFile(await safeFile(root, file), 'utf8');
      const { data } = splitDocument(raw);
      if (data.fixture === true) continue;
      const relative = file.slice('content/'.length);
      const legacy = !relative.endsWith('/index.md');
      const directoryCategory = Object.entries(categoryNames).find(([, name]) => name === relative.split('/')[0])?.[0];
      const category = categorySchema.parse(legacy ? data.category : directoryCategory);
      if (!legacy && data.category !== undefined && data.category !== category) throw new BlogError('栏目与文章目录不一致。');
      const id = legacy ? `legacy-${sha256(relative).slice(0, 24)}` : postSchema.shape.id.parse(data.id);
      if (!legacy && id.startsWith('legacy-')) throw new BlogError('缺少有效 UUID；使用 meta --init 补齐。');
      const title = postSchema.shape.title.parse(data.title);
      if (!title.trim()) throw new BlogError('文章标题不能为空。');
      const membership = data.series === undefined ? undefined : seriesRefSchema.safeParse(data.series);
      if (membership && !membership.success) issues.push({ file, message: '所属系列或章节序号无效。' });
      if (ids.has(id.toLowerCase())) issues.push({ file, message: `文章 ID 重复：${id}` });
      ids.add(id.toLowerCase());
      articles.push({ id, title, category, file, raw, ...(membership?.success ? { series: membership.data } : {}) });
    } catch (error) { issues.push({ file, message: error instanceof Error ? error.message : String(error) }); }
  }
  return { articles, issues };
}
