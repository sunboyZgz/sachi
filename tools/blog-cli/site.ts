import { cp, mkdir, mkdtemp, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { BlogError, exists, inside, readJson, safeFile, sha256, stableJson, walk, writeJson } from '../../src/lib/blog/files';
import { dayInTimezone } from '../../src/lib/blog/content';
import { mappedPost } from '../../src/lib/blog/preview';
import { manifestSchema, type BlogConfig, type BlogPost, type Manifest } from '../../src/lib/blog/schema';
import { cachePath, storePath } from './config';
import { prepareMedia } from './media';
import { run } from './process';
import { checksums, linkDependencies, readSnapshot, type CodeSnapshot } from './snapshot';
import { validateArticleLinks } from './plan';
import { withBasePath } from '../../src/lib/site-path';
import { readSeriesSnapshot } from './series';

export async function buildRelease(root: string, config: BlogConfig, manifest: Manifest, options: { echo?: boolean } = {}) {
  const codeDirectory = storePath(root, 'code', manifest.codeHash);
  const descriptor = await readJson(path.join(codeDirectory, 'code.json')) as CodeSnapshot;
  const digest = sha256(stableJson({ files: descriptor.hashes, buildCommand: descriptor.buildCommand, node: descriptor.node, platform: descriptor.platform, sharp: descriptor.sharp, ffmpeg: descriptor.ffmpeg }));
  if (descriptor.hash !== manifest.codeHash || digest !== manifest.codeHash) throw new BlogError('代码快照摘要不一致。', 4);
  if (descriptor.node !== process.version || descriptor.platform !== process.platform || stableJson(descriptor.sharp) !== stableJson(sharp.versions) || stableJson(descriptor.buildCommand) !== stableJson(config.buildCommand)) throw new BlogError('冻结构建的 Node/平台/图片工具或构建命令不匹配；不能用新环境恢复旧计划。', 4);
  const frozenFiles = (await walk(codeDirectory)).filter((file) => file !== 'code.json');
  if (frozenFiles.length !== descriptor.hashes.length) throw new BlogError('代码快照含额外文件；不能读取未知文件或环境配置。', 4);
  for (const [file, hash] of descriptor.hashes) {
    if (sha256(await readFile(await safeFile(codeDirectory, file))) !== hash) throw new BlogError(`冻结代码文件已变化：${file}`, 4);
    if ((file.startsWith('tools/blog-cli/') || file.startsWith('src/lib/blog/')) && sha256(await readFile(await safeFile(root, file))) !== hash) throw new BlogError(`发布流水线已变化：${file}；请恢复原流水线版本后 resume，或重新计划。`, 4);
  }
  const snapshots = await Promise.all(manifest.entries.map((entry) => readSnapshot(root, entry.revisionHash)));
  const seriesSnapshots = await Promise.all((manifest.series ?? []).map((entry) => readSeriesSnapshot(root, entry.revisionHash)));
  for (const [index, snapshot] of snapshots.entries()) if (stableJson(snapshot.post.series ?? null) !== stableJson(manifest.entries[index].series ?? null)) throw new BlogError('章节归属与发布清单不一致。', 4);
  for (const [index, snapshot] of seriesSnapshots.entries()) {
    const entry = manifest.series![index];
    if (snapshot.series.id !== entry.id || snapshot.series.slug !== entry.slug || snapshot.series.category !== entry.category || snapshot.series.title !== entry.title) throw new BlogError('系列快照与发布清单不一致。', 4);
  }
  if (snapshots.some((snapshot) => snapshot.dependencies.some((dependency) => /\.(?:mp4|webm|mov|m4v)$/i.test(dependency.file)))) {
    const currentVersion = await run(['ffmpeg', '-version'], { cwd: root, code: 3 }).then((result) => result.stdout.split('\n')[0]);
    if (descriptor.ffmpeg !== currentVersion) throw new BlogError('冻结视频工具版本与当前 FFmpeg 不一致；不能重新编码旧计划。', 4);
  }
  validateArticleLinks(manifest, snapshots.map((snapshot) => snapshot.post));
  const worktrees = cachePath(root, 'worktrees'); await mkdir(worktrees, { recursive: true });
  const directory = await mkdtemp(path.join(worktrees, `${manifest.releaseId}-`));
  await cp(storePath(root, 'code', manifest.codeHash), directory, { recursive: true });
  // Never copy root public/media, root content or any root .env into this build.
  const publicRoot = path.join(directory, 'public'); await mkdir(publicRoot, { recursive: true });
  const basePath = config.siteUrl ? new URL(config.siteUrl).pathname.replace(/\/$/, '') : '';
  const posts: BlogPost[] = [];
  for (const [index, snapshot] of snapshots.entries()) {
    const entry = manifest.entries[index];
    const assets = await prepareMedia(root, config, snapshot, publicRoot);
    for (const target of manifest.entries) assets[`blog:${target.id}`] = { url: `/article/${target.slug}/`, type: 'file' };
    for (const target of manifest.series ?? []) if (manifest.entries.some((chapter) => chapter.series?.id === target.id)) assets[`series:${target.id}`] = { url: `/series/${target.slug}/`, type: 'file' };
    for (const asset of Object.values(assets)) {
      asset.url = withBasePath(asset.url, basePath);
      if (asset.poster) asset.poster = withBasePath(asset.poster, basePath);
      if (asset.contour) asset.contour = withBasePath(asset.contour, basePath);
      if (asset.srcSet) asset.srcSet = asset.srcSet.split(',').map((variant) => { const [url, size] = variant.trim().split(/\s+/); return `${withBasePath(url, basePath)} ${size}`; }).join(', ');
    }
    manifest.assets[entry.id] = assets;
    posts.push(mappedPost({ ...snapshot.post, category: entry.category, date: dayInTimezone(entry.publishedAt, config.timezone) }, assets));
  }
  const input = path.join(directory, '.blog-input'); await mkdir(input);
  await writeJson(path.join(input, 'posts.json'), posts);
  await writeJson(path.join(input, 'series.json'), seriesSnapshots.map((snapshot) => snapshot.series));
  await writeJson(path.join(input, 'release.json'), manifest);
  await writeJson(path.join(publicRoot, 'release-marker.json'), { releaseId: manifest.releaseId });
  await linkDependencies(root, directory);
  const prefix = `${basePath}/versions/${manifest.releaseId}`;
  const environment: Partial<NodeJS.ProcessEnv> = {
    NODE_ENV: 'production',
    BLOG_CONTENT_MODE: 'release', BLOG_CONTENT_ROOT: input, BLOG_RELEASE_MANIFEST: path.join(input, 'release.json'),
    BLOG_ASSET_PREFIX: prefix, NEXT_PUBLIC_BLOG_ASSET_PREFIX: prefix, BLOG_TIMEZONE: config.timezone,
    NEXT_PUBLIC_BLOG_BASE_PATH: basePath,
    INCLUDE_FIXTURES: 'false', NEXT_TELEMETRY_DISABLED: '1', SITE_URL: undefined,
  };
  // Release builds intentionally do not inherit arbitrary NEXT_PUBLIC_* variables.
  for (const key of Object.keys(process.env)) if (key.startsWith('NEXT_PUBLIC_') && !(key in environment)) environment[key] = undefined;
  await run(config.buildCommand, { cwd: directory, env: environment, echo: options.echo, code: 6, timeout: 600_000 });
  const output = path.join(directory, 'out');
  if (!await exists(path.join(output, 'index.html'))) throw new BlogError('构建命令没有生成 out/index.html。', 6);
  const versioned = path.join(output, 'versions', manifest.releaseId); await mkdir(versioned, { recursive: true });
  if (await exists(path.join(output, '_next', 'static'))) await cp(path.join(output, '_next', 'static'), path.join(versioned, '_next', 'static'), { recursive: true });
  for (const asset of config.siteAssets) {
    const source = inside(output, asset); if (await exists(source)) {
      const destination = inside(versioned, asset); await mkdir(path.dirname(destination), { recursive: true }); await cp(source, destination);
    }
  }
  await verifySite(output, manifest, basePath);
  const packageDirectory = storePath(root, 'releases', manifest.releaseId);
  if (await exists(path.join(packageDirectory, 'checksums.json'))) {
    const existing = manifestSchema.parse(await readJson(path.join(packageDirectory, 'release.json')));
    if (existing.codeHash !== manifest.codeHash) throw new BlogError('发布 ID 已存在不同构建。', 4);
    return { directory: packageDirectory, manifest: existing };
  }
  if (await exists(packageDirectory)) {
    const preserved = cachePath(root, 'release-partials'); await mkdir(preserved, { recursive: true });
    await rename(packageDirectory, path.join(preserved, `${manifest.releaseId}-${Date.now()}`));
  }
  await mkdir(packageDirectory, { recursive: true });
  await cp(output, path.join(packageDirectory, 'site'), { recursive: true });
  for (const snapshot of snapshots) await cp(storePath(root, 'snapshots', snapshot.revisionHash), path.join(packageDirectory, 'snapshots', snapshot.revisionHash), { recursive: true });
  for (const snapshot of seriesSnapshots) await cp(storePath(root, 'series-snapshots', snapshot.revisionHash), path.join(packageDirectory, 'series-snapshots', snapshot.revisionHash), { recursive: true });
  await cp(storePath(root, 'code', manifest.codeHash), path.join(packageDirectory, 'code'), { recursive: true });
  await writeJson(path.join(packageDirectory, 'release.json'), manifest);
  await checksums(packageDirectory);
  return { directory: packageDirectory, manifest };
}

export async function verifySite(site: string, manifest: Manifest, basePath = '') {
  const localPath = (url: string) => basePath && url.startsWith(`${basePath}/`) ? url.slice(basePath.length) : url;
  const names = await walk(site);
  if (names.some((name) => name.endsWith('.map') || name.split('/').some((part) => part.startsWith('.') || ['content', 'snapshot.json', 'source.md', 'source.yaml', 'release.json', 'posts.json', 'series.json'].includes(part)))) throw new BlogError('公开构建产物包含源码、私有清单或 sourcemap。', 6);
  const articleSlugs = new Set(manifest.entries.map((entry) => entry.slug));
  const seriesSlugs = new Set((manifest.series ?? []).filter((series) => manifest.entries.some((entry) => entry.series?.id === series.id)).map((series) => series.slug));
  for (const name of names) {
    const match = /^article\/([^/]+)\/index.html$/.exec(name);
    if (match && match[1] !== '__empty__' && !articleSlugs.has(match[1])) throw new BlogError(`公开产物包含未选中的文章：${match[1]}`, 6);
    const group = /^series\/([^/]+)\/index.html$/.exec(name);
    if (group && group[1] !== '__empty__' && !seriesSlugs.has(group[1])) throw new BlogError(`公开产物包含未公开的系列：${group[1]}`, 6);
  }
  for (const mapping of Object.values(manifest.assets)) for (const asset of Object.values(mapping)) {
    const urls = [asset.url, asset.poster, asset.contour, ...asset.srcSet?.split(',').map((variant) => variant.trim().split(' ')[0]) ?? []].filter((url): url is string => !!url && localPath(url).startsWith('/media/'));
    for (const url of urls) if (!await exists(inside(site, localPath(url).slice(1)))) throw new BlogError(`发布媒体缺失：${url}`, 6);
  }
  for (const relative of ['index.html', 'contents/index.html', ...manifest.entries.map((entry) => `article/${entry.slug}/index.html`), ...[...seriesSlugs].map((slug) => `series/${slug}/index.html`)]) {
    const html = await readFile(await safeFile(site, relative), 'utf8');
    for (const match of html.matchAll(/(?:src|href|poster)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      const url = match[1].replaceAll('&amp;', '&');
      if (basePath && !url.startsWith(`${basePath}/`)) throw new BlogError(`产物链接缺少站点子路径：${relative} → ${url}`, 6);
      if (!path.extname(url) || url === '/') continue;
      const local = decodeURIComponent(localPath(url).slice(1));
      if (!await exists(inside(site, local))) throw new BlogError(`产物资源不存在：${relative} → ${url}`, 6);
    }
  }
  // Exercise the actual files through a local HTTP server, never production.
  const server = createServer(async (request, response) => {
    try {
      const url = localPath(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const relative = url === '/' ? 'index.html' : url.endsWith('/') ? `${url.slice(1)}index.html` : url.slice(1);
      response.end(await readFile(await safeFile(site, decodeURIComponent(relative))));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new BlogError('静态验收服务启动失败。', 6);
    for (const url of ['/', '/contents/', ...manifest.entries.map((entry) => `/article/${entry.slug}/`), ...[...seriesSlugs].map((slug) => `/series/${slug}/`), '/release-marker.json']) {
      const response = await fetch(`http://127.0.0.1:${address.port}${basePath}${url}`);
      if (!response.ok) throw new BlogError(`静态产物检查失败：${url}`, 6);
      await response.arrayBuffer();
    }
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
export async function copyExport(packageDirectory: string, root: string) {
  // Do not delete the user's export directory. Old files would leak withdrawn posts,
  // so preserve the entire old directory in a recoverable, explicitly named backup.
  const target = path.join(root, 'out');
  if (await exists(target)) {
    const backups = cachePath(root, 'export-backups'); await mkdir(backups, { recursive: true });
    await rename(target, path.join(backups, `out-${Date.now()}`));
  }
  await cp(path.join(packageDirectory, 'site'), target, { recursive: true });
  return target;
}
export async function verifyPackage(directory: string) {
  const checks = await readJson(path.join(directory, 'checksums.json')) as Record<string, string>;
  const files = (await walk(directory)).filter((file) => file !== 'checksums.json');
  if (files.length !== Object.keys(checks).length) throw new BlogError('发布包文件清单不一致。', 3);
  for (const file of files) if (sha256(await readFile(await safeFile(directory, file))) !== checks[file]) throw new BlogError(`发布包摘要错误：${file}`, 3);
}
