import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { readSourcePost, type SourcePost } from '../../src/lib/blog/content';
import { BlogError, atomicWrite, exists, inside, readJson, safeFile, sha256, stableJson, walk, writeJson } from '../../src/lib/blog/files';
import { snapshotSchema, type BlogConfig, type Snapshot } from '../../src/lib/blog/schema';
import { storePath } from './config';
import { run } from './process';

export async function saveSnapshot(root: string, config: BlogConfig, source: SourcePost) {
  const fresh = await readSourcePost(root, source.sourcePath, config);
  if (fresh.revisionHash !== source.revisionHash || fresh.raw !== source.raw) throw new BlogError(`确认后文章发生变化：${source.post.title}`, 4);
  const directory = storePath(root, 'snapshots', source.revisionHash);
  if (await exists(path.join(directory, 'snapshot.json'))) return await readSnapshot(root, source.revisionHash);
  const snapshot: Snapshot = {
    schemaVersion: 1, revisionHash: source.revisionHash, sourcePath: source.sourcePath, sourceHash: sha256(source.raw), post: source.post, media: source.media,
    dependencies: source.dependencies.map(({ url, file, hash, bytes }) => ({ url, file, hash, bytes })),
  };
  for (const dependency of source.dependencies) {
    const bytes = await readFile(dependency.sourceFile);
    if (sha256(bytes) !== dependency.hash) throw new BlogError(`冻结过程中资源发生变化：${dependency.url}`, 4);
    await immutableWrite(inside(path.join(directory, 'files'), dependency.file), bytes);
  }
  await immutableWrite(path.join(directory, 'source.md'), source.raw);
  await immutableWrite(path.join(directory, 'snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}
export async function immutableWrite(file: string, value: string | Uint8Array) {
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(file, value, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (sha256(await readFile(file)) !== sha256(typeof value === 'string' ? Buffer.from(value) : value)) throw new BlogError(`不可变对象内容冲突：${file}`, 4);
  }
}
export async function readSnapshot(root: string, hash: string) {
  const directory = storePath(root, 'snapshots', hash);
  const snapshot = snapshotSchema.parse(await readJson(path.join(directory, 'snapshot.json')));
  if (sha256(await readFile(path.join(directory, 'source.md'))) !== snapshot.sourceHash) throw new BlogError(`原始 Markdown 快照被改动：${hash}`);
  if (snapshot.revisionHash !== hash || sha256(stableJson({ post: snapshot.post, media: snapshot.media, dependencies: snapshot.dependencies })) !== hash) throw new BlogError(`快照摘要不匹配：${hash}`);
  for (const dependency of snapshot.dependencies) {
    if (sha256(await readFile(await safeFile(path.join(directory, 'files'), dependency.file))) !== dependency.hash) throw new BlogError(`快照资源被改动：${dependency.file}`);
  }
  return snapshot;
}
const codeFiles = ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts'];
export type CodeSnapshot = {
  hash: string; commit: string | null; hashes: [string, string][];
  node: string; platform: string; sharp: typeof sharp.versions;
  ffmpeg: string | null; buildCommand: string[];
};
export async function codeBaseline(root: string, config: BlogConfig, freeze = false) {
  const files: Array<{ relative: string; bytes: Buffer }> = [];
  let commit: string | null = null;
  if (config.codeRef) {
    try {
      commit = (await run(['git', 'rev-parse', '--verify', `${config.codeRef}^{commit}`], { cwd: root, code: 5 })).stdout.trim();
      const rows = (await run(['git', 'ls-tree', '-r', commit, '--', 'src', ...codeFiles], { cwd: root, code: 5 })).stdout.trim().split('\n').filter(Boolean);
      for (const row of rows) {
        const match = /^(\d+) blob [a-f0-9]+\t(.+)$/.exec(row);
        if (!match || match[1] === '120000') throw new BlogError('代码基线含非普通文件。');
        if (/\.test\.tsx?$/.test(match[2])) continue;
        files.push({ relative: match[2], bytes: await gitFile(root, commit, match[2]) });
      }
      for (const asset of config.siteAssets) files.push({ relative: `public/${asset}`, bytes: await gitFile(root, commit, `public/${asset}`) });
    } catch (error) { throw new BlogError(`无法读取指定代码版本；无 Git 时请将 codeRef 保持 null。${error instanceof Error ? error.message : ''}`, 5); }
  } else {
    for (const relative of [...await walk(path.join(root, 'src')).then((items) => items.filter((item) => !/\.test\.tsx?$/.test(item)).map((item) => `src/${item}`)), ...codeFiles, ...config.siteAssets.map((item) => `public/${item}`)]) {
      files.push({ relative, bytes: await readFile(await safeFile(root, relative)) });
    }
  }
  for (const folder of ['tools/blog-cli', 'bin', 'vendor']) {
    for (const relative of await walk(path.join(root, folder))) {
      if (/\.test\.tsx?$/.test(relative)) continue;
      const name = `${folder}/${relative}`;
      files.push({ relative: name, bytes: await readFile(await safeFile(root, name)) });
    }
  }
  files.push({ relative: 'blog.config.json', bytes: Buffer.from(JSON.stringify({ schemaVersion: 1, timezone: config.timezone, siteUrl: config.siteUrl, siteAssets: config.siteAssets, media: config.media, buildCommand: config.buildCommand, ...(config.yandu ? { yandu: { gateway: config.yandu.gateway, projectId: config.yandu.projectId, credentialEnv: config.yandu.credentialEnv } } : {}) })) });
  const hashes = files.map(({ relative, bytes }) => [relative, sha256(bytes)]).sort(([a], [b]) => a.localeCompare(b));
  const ffmpeg = await run(['ffmpeg', '-version'], { cwd: root, code: 3 }).then((result) => result.stdout.split('\n')[0]).catch(() => null);
  const hash = sha256(stableJson({ files: hashes, buildCommand: config.buildCommand, node: process.version, platform: process.platform, sharp: sharp.versions, ffmpeg }));
  if (freeze) {
    const directory = storePath(root, 'code', hash);
    for (const { relative, bytes } of files) await immutableWrite(inside(directory, relative), bytes);
    await immutableWrite(path.join(directory, 'code.json'), JSON.stringify({ hash, commit, hashes, node: process.version, platform: process.platform, sharp: sharp.versions, ffmpeg, buildCommand: config.buildCommand }));
  }
  return { hash, commit };
}
async function gitFile(root: string, commit: string, relative: string) {
  const { spawn } = await import('node:child_process');
  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn('git', ['show', `${commit}:${relative}`], { cwd: root, shell: false });
    const chunks: Buffer[] = []; let error = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => { error += chunk.toString(); });
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new BlogError(error, 5)));
  });
}
export async function linkDependencies(root: string, directory: string) {
  if (sha256(await readFile(path.join(root, 'package-lock.json'))) !== sha256(await readFile(path.join(directory, 'package-lock.json')))) throw new BlogError('冻结代码版本的依赖锁与当前安装基线不一致；请先为对应代码版本准备匹配依赖。', 6);
  if (!await exists(path.join(directory, 'node_modules'))) await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
}
export async function checksums(directory: string) {
  const values: Record<string, string> = {};
  for (const file of await walk(directory)) if (file !== 'checksums.json') values[file] = sha256(await readFile(await safeFile(directory, file)));
  await writeJson(path.join(directory, 'checksums.json'), values);
  return values;
}
export async function cacheCurrent(root: string, manifest: unknown) {
  await atomicWrite(storePath(root, 'current.json'), JSON.stringify({ checkedAt: new Date().toISOString(), manifest }, null, 2));
}
