import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlogError, exists, readJson, safeFile, sha256 } from '../../src/lib/blog/files';
import { configSchema, manifestSchema } from '../../src/lib/blog/schema';
import { run } from './process';
import { verifySite } from './site';
import { pagesFiles } from './pages-files';

/** Portable rendering only: media are encoded and frozen before the Git push. */
export async function buildPages(root: string, echo = true) {
  const bundle = await readJson(path.join(root, '.blog-pages.json')) as { managedBy: string; node: string; basePath: string };
  if (bundle.managedBy !== 'sachi-blog-cli' || bundle.node !== process.version || !/^(?:\/[a-zA-Z0-9_.-]+)?$/.test(bundle.basePath)) throw new BlogError('Pages 构建包或 Node 版本不匹配。', 6);
  const hashes = await readJson(path.join(root, '.blog-input/checksums.json')) as Record<string, string>;
  const files = await pagesFiles(root);
  if (files.length !== Object.keys(hashes).length) throw new BlogError('Pages 冻结包包含额外或缺失文件。', 6);
  for (const file of files) if (sha256(await readFile(await safeFile(root, file))) !== hashes[file]) throw new BlogError(`Pages 冻结文件发生变化：${file}`, 6);
  const config = configSchema.parse(await readJson(path.join(root, 'blog.config.json')));
  const input = path.join(root, '.blog-input');
  const manifest = manifestSchema.parse(await readJson(path.join(input, 'release.json')));
  const prefix = `${bundle.basePath}/versions/${manifest.releaseId}`;
  const env: Partial<NodeJS.ProcessEnv> = {
    NODE_ENV: 'production', BLOG_CONTENT_MODE: 'release', BLOG_CONTENT_ROOT: input,
    BLOG_RELEASE_MANIFEST: path.join(input, 'release.json'), BLOG_TIMEZONE: config.timezone,
    BLOG_ASSET_PREFIX: prefix, NEXT_PUBLIC_BLOG_ASSET_PREFIX: prefix,
    NEXT_PUBLIC_BLOG_BASE_PATH: bundle.basePath, INCLUDE_FIXTURES: 'false', NEXT_TELEMETRY_DISABLED: '1', SITE_URL: undefined,
  };
  for (const key of Object.keys(process.env)) if (key.startsWith('NEXT_PUBLIC_') && !(key in env)) env[key] = undefined;
  await run(config.buildCommand, { cwd: root, env, echo, code: 6, timeout: 600_000 });
  const output = path.join(root, 'out');
  const versioned = path.join(output, 'versions', manifest.releaseId); await mkdir(versioned, { recursive: true });
  if (await exists(path.join(output, '_next/static'))) await cp(path.join(output, '_next/static'), path.join(versioned, '_next/static'), { recursive: true });
  for (const file of config.siteAssets) if (await exists(path.join(output, file))) {
    const destination = path.join(versioned, file); await mkdir(path.dirname(destination), { recursive: true }); await cp(path.join(output, file), destination);
  }
  await verifySite(output, manifest, bundle.basePath);
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildPages(process.cwd()).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 6; });
