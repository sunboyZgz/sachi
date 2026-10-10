import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { BlogError, exists, inside, readJson, safeFile } from '../../src/lib/blog/files';
import { configSchema, defaultConfig, type BlogConfig } from '../../src/lib/blog/schema';
import { profileSchema } from '../../src/config/profile-schema';
import { githubTarget } from './pages';

export async function loadConfig(root: string): Promise<BlogConfig> {
  for (const folder of ['content', 'public', 'templates', '.blog', '.blog-store']) {
    const directory = path.join(root, folder);
    if (await exists(directory) && (await lstat(directory)).isSymbolicLink()) throw new BlogError(`项目数据目录不能是符号链接：${folder}`, 2);
  }
  const file = path.join(root, 'blog.config.json');
  const config = await exists(file) ? configSchema.parse(await readJson(file)) : defaultConfig();
  const profileFile = 'src/config/profile.json';
  if (await exists(path.join(root, profileFile))) {
    const result = profileSchema.safeParse(await readJson(await safeFile(root, profileFile)));
    if (!result.success) throw new BlogError(`公开个人配置无效（${profileFile}）：${result.error.issues.map((issue) => `${issue.path.join('.') || '配置'}: ${issue.message}`).join('；')}`, 2);
  }
  return validateConfig(root, config);
}
export function validateConfig(root: string, config: BlogConfig): BlogConfig {
  try { new Intl.DateTimeFormat('en', { timeZone: config.timezone }); }
  catch { throw new BlogError(`时区无效：${config.timezone}`, 2); }
  for (const asset of config.siteAssets) inside(path.join(root, 'public'), asset);
  if (config.git?.remote.startsWith('-')) throw new BlogError('Git 远端不能以 - 开头。', 2);
  if (config.pages?.remote) githubTarget(config.pages.remote);
  if (config.pages && config.git && ['blog', 'main'].includes(config.git.branch)) throw new BlogError('Git 写作备份不能使用开发 main 或公开 Pages 的 blog 分支；请保留独立 content-source 分支或仓库。', 2);
  if (config.deploy) {
    const deployRoot = path.resolve(config.deploy.root);
    if (!path.isAbsolute(config.deploy.root) || deployRoot === '/' || deployRoot === process.env.HOME || deployRoot === path.resolve(root) || deployRoot.split(path.sep).filter(Boolean).length < 2) throw new BlogError('发布根必须是明确的专用绝对目录，不能是根目录、主目录或项目目录。', 2);
    if (config.deploy.type === 'ssh' && !config.siteUrl) throw new BlogError('SSH 部署必须配置正式 siteUrl，以验证上线标记。', 2);
  }
  return config;
}
export const storePath = (root: string, ...parts: string[]) => path.join(root, '.blog-store', ...parts);
export const cachePath = (root: string, ...parts: string[]) => path.join(root, '.blog', ...parts);
