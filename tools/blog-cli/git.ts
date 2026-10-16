import { contentDirectory } from '../../src/lib/blog/storage';
import { cp, mkdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { BlogError, atomicWrite, exists, inside, readJson, safeDirectory, safeFile, sha256, stableJson, walk, writeJson } from '../../src/lib/blog/files';
import { splitDocument } from '../../src/lib/blog/content';
import { type BlogConfig, type Manifest } from '../../src/lib/blog/schema';
import { cachePath, storePath } from './config';
import { run } from './process';
import { readSnapshot } from './snapshot';
import { readSeriesSnapshot } from './series';

const gitEnvironment = { GIT_TERMINAL_PROMPT: '0', GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined, GIT_COMMON_DIR: undefined, GIT_OBJECT_DIRECTORY: undefined, GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined };
async function git(root: string, directory: string, args: string[]) { return await run(['git', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: directory || root, code: 5, env: gitEnvironment }); }
export async function remoteTip(root: string, config: BlogConfig) {
  if (!config.git) return null;
  const value = (await git(root, root, ['ls-remote', '--heads', config.git.remote, `refs/heads/${config.git.branch}`])).stdout.trim();
  return value ? value.split(/\s/)[0] : null;
}
async function repository(root: string, config: BlogConfig) {
  if (!config.git) return null;
  if (config.git.visibility === 'unconfirmed') throw new BlogError('先确认内容仓库 private/public；不能向未知可见性的仓库上传草稿。', 2);
  const directory = cachePath(root, 'git-content');
  const tip = await remoteTip(root, config);
  const stateFile = storePath(root, 'git.json');
  let state = await exists(stateFile) ? await readJson(stateFile) as { remote: string; branch: string; tip: string | null } : null;
  if (state && (state.remote !== config.git.remote || state.branch !== config.git.branch)) throw new BlogError('Git 接入配置已变化；请使用新的独立缓存目录，不能混用旧基线。', 4);
  if (state && state.tip !== tip) {
    const pending = await exists(storePath(root, 'pending-git.json')) ? await readJson(storePath(root, 'pending-git.json')) as { base: string | null; head: string } : null;
    if (!pending || pending.base !== state.tip || pending.head !== tip) throw new BlogError('远端分支比已知基线更新；拒绝自动合并或强推。先恢复/核对远端。', 4);
    state = { ...state, tip }; await writeJson(stateFile, state);
  }
  if (!await exists(path.join(directory, '.git'))) {
    await mkdir(directory, { recursive: true });
    await git(root, directory, ['init', `--initial-branch=${config.git.branch}`]);
    await git(root, directory, ['remote', 'add', 'origin', config.git.remote]);
    if (tip) {
      await git(root, directory, ['fetch', 'origin', config.git.branch]);
      await git(root, directory, ['checkout', '-B', config.git.branch, 'FETCH_HEAD']);
    }
    await git(root, directory, ['config', 'user.name', 'Sachi Blog CLI']);
    await git(root, directory, ['config', 'user.email', 'blog-cli@localhost']);
    await writeJson(stateFile, { remote: config.git.remote, branch: config.git.branch, tip });
  } else {
    const head = (await git(root, directory, ['rev-parse', '--verify', 'HEAD']).catch(() => ({ stdout: '' }))).stdout.trim() || null;
    if (head !== tip) {
      const receipt = await exists(storePath(root, 'pending-git.json')) ? await readJson(storePath(root, 'pending-git.json')) as { base: string | null; head: string } : null;
      if (!receipt || receipt.base !== tip || receipt.head !== head) throw new BlogError('隔离 Git 仓库包含未同步状态；不能覆盖。', 4);
      await git(root, directory, ['push', 'origin', `HEAD:refs/heads/${config.git.branch}`]);
      await writeJson(stateFile, { remote: config.git.remote, branch: config.git.branch, tip: head });
    }
  }
  return directory;
}
async function commitPush(root: string, config: BlogConfig, directory: string, message: string) {
  // This is the tool-owned content checkout, never the user's root checkout.
  await git(root, directory, ['add', '--all', '--', '.']);
  const changed = (await git(root, directory, ['diff', '--cached', '--name-only'])).stdout.trim();
  if (changed) await git(root, directory, ['commit', '-m', message]);
  const head = (await git(root, directory, ['rev-parse', 'HEAD'])).stdout.trim();
  const base = await remoteTip(root, config);
  const known = await readJson(storePath(root, 'git.json')) as { tip: string | null };
  if (known.tip !== base) throw new BlogError('提交期间远端基线已变化；未推送，需核对远端。', 4);
  await writeJson(storePath(root, 'pending-git.json'), { base, head });
  await git(root, directory, ['push', 'origin', `HEAD:refs/heads/${config.git!.branch}`]);
  await writeJson(storePath(root, 'git.json'), { remote: config.git!.remote, branch: config.git!.branch, tip: head });
  return head;
}
async function ensurePaths(directory: string) {
  for (const item of ['content', '.snapshots', '.release', 'templates', 'public']) {
    const folder = await safeDirectory(directory, item);
    await walk(folder);
  }
  if (!await exists(path.join(directory, 'content.config.json'))) await writeJson(path.join(directory, 'content.config.json'), { schemaVersion: 1 });
}
export async function saveReleaseToGit(root: string, config: BlogConfig, manifest: Manifest, selectedIds?: string[], selectedSeries?: string[]) {
  if (!config.git) return { status: 'SKIPPED', commit: null };
  const directory = (await repository(root, config))!; await ensurePaths(directory);
  for (const entry of manifest.entries) {
    const destination = path.join(directory, '.snapshots', entry.revisionHash);
    if (!await exists(destination)) await cp(storePath(root, 'snapshots', entry.revisionHash), destination, { recursive: true });
    if ((selectedIds ?? manifest.entries.filter((item) => !item.gitCommit).map((item) => item.id)).includes(entry.id)) {
      const snapshot = await readSnapshot(root, entry.revisionHash);
      for (const previous of (await walk(path.join(directory, 'content'))).filter((file) => file.endsWith('/index.md'))) {
        const old = await readFile(await safeFile(path.join(directory, 'content'), previous), 'utf8');
        if (splitDocument(old).data.id !== entry.id || `content/${previous}` === entry.sourcePath) continue;
        const preserved = cachePath(root, 'git-moved', `${entry.id}-${Date.now()}`); await mkdir(path.dirname(preserved), { recursive: true });
        await rename(path.dirname(path.join(directory, 'content', previous)), preserved);
      }
      const main = inside(directory, entry.sourcePath);
      await atomicWrite(main, await readFile(storePath(root, 'snapshots', entry.revisionHash, 'source.md')));
      const assetsRoot = entry.sourcePath.endsWith('/index.md') ? path.dirname(main) : path.join(directory, 'public');
      for (const dependency of snapshot.dependencies) await atomicWrite(inside(assetsRoot, dependency.file), await readFile(storePath(root, 'snapshots', entry.revisionHash, 'files', dependency.file)));
      if (Object.keys(snapshot.media.assets).length) {
        const { stringify } = await import('yaml'); await atomicWrite(path.join(path.dirname(main), 'media.yaml'), stringify(snapshot.media));
      }
    }
  }
  for (const entry of manifest.series ?? []) {
    const destination = path.join(directory, '.series-snapshots', entry.revisionHash);
    if (!await exists(destination)) await cp(storePath(root, 'series-snapshots', entry.revisionHash), destination, { recursive: true });
    if (selectedSeries?.includes(entry.id)) {
      const snapshot = await readSeriesSnapshot(root, entry.revisionHash);
      await safeDirectory(directory, 'content/series');
      await atomicWrite(inside(directory, snapshot.sourcePath), await readFile(storePath(root, 'series-snapshots', entry.revisionHash, 'source.yaml')));
    }
  }
  const snapshotCommit = await commitPush(root, config, directory, `content snapshots ${manifest.releaseId}`);
  for (const entry of manifest.entries) if (!entry.gitCommit) entry.gitCommit = snapshotCommit;
  await writeJson(path.join(directory, '.release', `${manifest.releaseId}.json`), manifest);
  await commitPush(root, config, directory, `candidate release ${manifest.releaseId}`);
  return { status: 'SYNCED', commit: snapshotCommit };
}
export async function recordToGit(root: string, config: BlogConfig, releaseId: string, record: unknown) {
  if (!config.git) return { status: 'SKIPPED' };
  const directory = (await repository(root, config))!; await ensurePaths(directory);
  await writeJson(path.join(directory, '.release', 'records', `${releaseId}.json`), record);
  await commitPush(root, config, directory, `release record ${releaseId}`);
  return { status: 'SYNCED' };
}
export async function backupPlan(root: string, config: BlogConfig) {
  const files = (await walk(path.join(root, await contentDirectory(root, config)))).filter((file) => file !== '.gitkeep');
  const normalized = new Map<string, string>();
  const hashes: Record<string, string> = {};
  const warnings: string[] = [];
  for (const file of files) {
    const key = file.normalize('NFC').toLowerCase();
    if (normalized.has(key) && normalized.get(key) !== file) throw new BlogError(`备份存在跨平台路径冲突：${file} / ${normalized.get(key)}`);
    normalized.set(key, file);
    if (file.split('/').some((part) => part.startsWith('.') || ['node_modules', '.blog', '.git'].includes(part)) || /\.(?:pem|key|p12)$/i.test(file)) throw new BlogError(`备份范围包含禁止文件：${file}`);
    const bytes = await readFile(await safeFile(path.join(root, await contentDirectory(root, config)), file));
    if (bytes.length > config.media.maxGitFileMiB * 1024 ** 2) throw new BlogError(`源文件超过 Git 体积限制：${file}`);
    if (bytes.length > 50 * 1024 ** 2) warnings.push(`超过 50 MiB：${file}`);
    hashes[file] = sha256(bytes);
  }
  const previous = await exists(storePath(root, 'backup.json')) ? await readJson(storePath(root, 'backup.json')) as Record<string, string> : {};
  return { sourceTreeHash: sha256(stableJson(hashes)), hashes, added: files.filter((file) => !previous[file]), modified: files.filter((file) => previous[file] && previous[file] !== hashes[file]), deleted: Object.keys(previous).filter((file) => !hashes[file]), warnings };
}
export async function syncContent(root: string, config: BlogConfig, plan: Awaited<ReturnType<typeof backupPlan>>) {
  if (!config.git) return { status: 'SKIPPED', reason: '未配置 Git 内容仓库，没有提交或推送。' };
  const directory = (await repository(root, config))!; await ensurePaths(directory);
  const preserved = cachePath(root, 'git-backups', `content-${Date.now()}`); await mkdir(path.dirname(preserved), { recursive: true });
  await rename(path.join(directory, 'content'), preserved);
  await mkdir(path.join(directory, 'content'));
  for (const [file, hash] of Object.entries(plan.hashes)) {
    const input = await safeFile(path.join(root, await contentDirectory(root, config)), file); const bytes = await readFile(input);
    if (sha256(bytes) !== hash) throw new BlogError(`确认后源文件发生变化：${file}`, 4);
    const output = path.join(directory, 'content', file); await atomicWrite(output, bytes);
  }
  if (await exists(path.join(root, 'templates', 'post.md'))) await cp(await safeFile(path.join(root, 'templates'), 'post.md'), path.join(directory, 'templates', 'post.md'));
  await writeJson(path.join(directory, 'content.config.json'), { schemaVersion: 1, timezone: config.timezone });
  const commit = await commitPush(root, config, directory, 'save writing progress');
  await writeJson(storePath(root, 'backup.json'), plan.hashes);
  return { status: 'SYNCED', commit };
}
export async function restoreGit(root: string, config: BlogConfig, destination: string) {
  if (!config.git) throw new BlogError('没有配置 Git 内容仓库。', 2);
  if (await exists(destination)) throw new BlogError('恢复目标必须是尚不存在的新目录，不能覆盖正在写作的目录。', 2);
  await run(['git', '-c', 'core.hooksPath=/dev/null', 'clone', '--single-branch', '--branch', config.git.branch, '--', config.git.remote, destination], { cwd: root, code: 5, env: gitEnvironment });
  await walk(path.join(destination, 'content'));
  await walk(path.join(destination, '.snapshots'));
  await walk(path.join(destination, '.series-snapshots'));
  await walk(path.join(destination, 'public'));
  return { status: 'RESTORED', destination, note: '仅恢复内容和发布记录，不包含网站代码；连接服务器后核实线上状态。' };
}
