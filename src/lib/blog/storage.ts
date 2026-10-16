import path from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
import { BlogError, exists, inside, safeDirectory, safeFile } from './files';
import { configSchema, type BlogConfig } from './schema';

/** Persisted identities remain content/...; only live filesystem access is mapped. */
export function logicalSourcePath(value: string) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\.blog-store\/content(?=\/|$)/, 'content');
}

export async function assertStorageReady(root: string) {
  if (await exists(path.join(root, '.blog-store')) && (await lstat(path.join(root, '.blog-store'))).isSymbolicLink()) throw new BlogError('持久目录不能是符号链接。', 4);
  if (await exists(path.join(root, '.blog-store/storage-migration.json'))) throw new BlogError('存储迁移尚未完成。请重试 npm run backup -- migrate，或按迁移 ID 撤销；不会读写另一份原稿。', 4, 'STORAGE_MIGRATION_REQUIRED');
}

export async function contentDirectory(root: string, config?: Pick<BlogConfig, 'contentDir'>): Promise<BlogConfig['contentDir']> {
  await assertStorageReady(root);
  if (config) return config.contentDir;
  try { return configSchema.parse(JSON.parse(await readFile(await safeFile(root, 'blog.config.json'), 'utf8'))).contentDir; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  // Old unconfigured projects remain readable; never merge two source trees.
  const legacy = await exists(path.join(root, 'content'));
  const stored = await exists(path.join(root, '.blog-store/content'));
  if (legacy && stored) throw new BlogError('发现两处原稿目录，请完成存储迁移或明确配置 contentDir；不会合并读取。', 4);
  return legacy ? 'content' : '.blog-store/content';
}

export async function writingPath(root: string, value: string, config?: Pick<BlogConfig, 'contentDir'>) {
  const logical = logicalSourcePath(value);
  inside(root, logical);
  if (logical === 'content' || logical.startsWith('content/')) {
    const directory = await contentDirectory(root, config);
    return inside(root, logical.replace(/^content(?=\/|$)/, directory));
  }
  return inside(root, logical);
}

export async function writingFile(root: string, value: string, config?: Pick<BlogConfig, 'contentDir'>) {
  return safeFile(root, path.relative(root, await writingPath(root, value, config)));
}

export async function writingDirectory(root: string, value: string, config?: Pick<BlogConfig, 'contentDir'>) {
  return safeDirectory(root, path.relative(root, await writingPath(root, value, config)));
}

export async function physicalSourcePath(root: string, value: string) {
  return path.relative(root, await writingPath(root, value)).split(path.sep).join('/');
}
