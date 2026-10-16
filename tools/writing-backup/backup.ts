import path from 'node:path';
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BlogError, atomicWrite, exists, safeFile, sha256, stableJson } from '../../src/lib/blog/files';
import { contentDirectory } from '../../src/lib/blog/storage';
import { run } from '../blog-cli/process';
import { githubTarget } from '../blog-cli/pages';
import { assertNoPendingWrites } from '../blog-cli/writing-transactions';
import { withDataLocks } from './migrate';

const branch = 'codex/writing-backup';
const environment = { GIT_TERMINAL_PROMPT: '0', GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined, GIT_COMMON_DIR: undefined, GIT_OBJECT_DIRECTORY: undefined, GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined };
const git = (directory: string, args: string[]) => run(['git', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: directory, env: environment, code: 5 });
const store = (root: string) => path.join(root, '.blog-store');
export type BackupServices = { verifyRemote: (remote: string) => Promise<void> };
const services: BackupServices = { verifyRemote: async (remote) => {
  const target = githubTarget(remote);
  const response = await run(['gh', 'api', `repos/${target.repository}`, '--jq', '.private'], { cwd: process.cwd(), code: 5 });
  if (response.stdout.trim() !== 'true') throw new BlogError('备份目标必须是已核实的私有 GitHub 仓库；不会上传草稿到公开或未知仓库。', 2);
} };

async function ordinaryStore(root: string) {
  if (await contentDirectory(root) !== '.blog-store/content') throw new BlogError('请先运行 npm run backup -- migrate，将原稿统一迁入 .blog-store/content。', 2);
  await mkdir(store(root), { recursive: true });
  if ((await lstat(store(root))).isSymbolicLink()) throw new BlogError('持久目录不能是符号链接。', 2);
}
async function ownRepository(root: string) {
  const directory = store(root);
  if (!await exists(path.join(directory, '.git')) || !(await lstat(path.join(directory, '.git'))).isDirectory() || (await lstat(path.join(directory, '.git'))).isSymbolicLink()) throw new BlogError('尚未初始化独立资料仓库。请运行 npm run backup -- init --remote <私有仓库地址>；不会使用外层仓库。', 2);
  const top = (await git(directory, ['rev-parse', '--show-toplevel'])).stdout.trim();
  if (await realpath(top) !== await realpath(directory)) throw new BlogError('Git 工作目录不是 .blog-store，停止操作。', 4);
  const current = (await git(directory, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim();
  if (current !== branch) throw new BlogError(`资料仓库应使用 ${branch}，不会切换或操作其他分支。`, 4);
  return directory;
}
async function remoteAddress(directory: string) {
  const remote = (await git(directory, ['remote', 'get-url', '--all', 'origin'])).stdout.trim();
  const push = (await git(directory, ['remote', 'get-url', '--push', '--all', 'origin'])).stdout.trim();
  if (!remote || remote.includes('\n') || push.includes('\n') || remote !== push) throw new BlogError('资料仓库必须有且只有一个一致的读取和推送目标，请核对 origin。', 4);
  return remote;
}

export async function initializeBackup(root: string, remote: string, api: BackupServices = services) {
  if (!remote || remote.startsWith('-') || /[\r\n\0]/.test(remote)) throw new BlogError('初始化需要明确的私有仓库地址，不读取根仓库 origin。', 2);
  await api.verifyRemote(remote);
  return withDataLocks(root, async () => {
    await assertNoPendingWrites(root);
    await ordinaryStore(root);
    if (await exists(path.join(store(root), '.git'))) {
      const directory = await ownRepository(root);
      const remotes = (await git(directory, ['remote'])).stdout.trim().split(/\s+/);
      if (remotes.includes('origin')) {
        if (await remoteAddress(directory) !== remote) throw new BlogError('已配置不同的资料远端，拒绝自动更换。', 4);
      } else await git(directory, ['remote', 'add', 'origin', remote]);
    } else {
      await git(store(root), ['init', '--object-format=sha1', `--initial-branch=${branch}`]);
      await ownRepository(root);
      await git(store(root), ['remote', 'add', 'origin', remote]);
    }
    const ignore = path.join(store(root), '.gitignore');
    if (!await exists(ignore)) await atomicWrite(ignore, '.DS_Store\nnode_modules/\n*.tmp-*\n.pending-*\n');
    const readme = path.join(store(root), 'README.md');
    if (!await exists(readme)) await atomicWrite(readme, '# Sachi 私有写作资料\n\ncontent/ 是当前原稿及篇内素材；drafts/ 是主动留存的历史稿件；其余持久目录保留发布与恢复资料。\n\n在新机器先克隆 Sachi 代码仓库，再将本仓库克隆到项目根目录的 .blog-store，使用分支 codex/writing-backup。配置 contentDir 为 .blog-store/content，然后安装依赖并运行 npm run dev。不要把整个目录交给静态网站服务。\n\n备份：在代码项目根目录执行 npm run backup。该命令不发布网页。\n');
    return { status: 'INITIALIZED', directory: store(root), remote, branch, pushed: false };
  });
}

type Inventory = Record<string, { hash: string; blob: string; bytes: number }>;
async function inventory(directory: string, algorithm = 'sha1'): Promise<Inventory> {
  const result: Inventory = {};
  const normalized = new Set<string>();
  async function visit(folder: string, prefix = '') {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!prefix && entry.name === '.git' || entry.name === '.DS_Store') continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile()) throw new BlogError(`资料备份只接受普通文件和目录：${relative}`, 4);
      if (entry.name === '.git' || /^\.env(?:\.|$)/i.test(entry.name) || /\.(?:pem|key|p12)$/i.test(entry.name) || /^(?:\.pending-|.*\.tmp-)/.test(entry.name)) throw new BlogError(`发现不应提交的文件或未完成写入：${relative}`, 4);
      if (entry.isDirectory()) { if (entry.name === 'node_modules') throw new BlogError(`资料目录包含依赖：${relative}`, 4); await visit(path.join(folder, entry.name), relative); continue; }
      const key = relative.normalize('NFC').toLowerCase();
      if (normalized.has(key)) throw new BlogError(`备份路径存在跨平台冲突：${relative}`, 4);
      normalized.add(key);
      const file = await safeFile(directory, relative);
      if ((await lstat(file)).size > 100 * 1024 ** 2) throw new BlogError(`文件超过普通 Git 备份的 100 MiB 上限：${relative}`, 4);
      const bytes = await readFile(file);
      result[relative] = { hash: sha256(bytes), blob: createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), bytes: bytes.length };
    }
  }
  await visit(directory);
  return result;
}
async function head(directory: string) {
  return git(directory, ['rev-parse', '--verify', 'HEAD']).then((result) => result.stdout.trim()).catch(() => null);
}
async function checkRemote(directory: string, remote: string) {
  const tip = (await git(directory, ['ls-remote', '--heads', remote, `refs/heads/${branch}`])).stdout.trim().split(/\s/)[0] || null;
  const current = await head(directory);
  if (tip) {
    if (!current) throw new BlogError('远端已有备份历史；请先克隆核对，不能用当前空历史覆盖。', 4);
    await git(directory, ['fetch', '--no-tags', 'origin', `refs/heads/${branch}`]);
    await git(directory, ['merge-base', '--is-ancestor', tip, current]).catch(() => { throw new BlogError('远端有本地尚未包含的提交；请核对两边资料，不自动合并或强推。', 4); });
  }
  return tip;
}

export async function backupWriting(root: string, options: { dryRun?: boolean } = {}, api: BackupServices = services) {
  // Never use git -C on an uninitialized directory: Git would discover the outer repository.
  const directory = await ownRepository(root);
  const remote = await remoteAddress(directory);
  const algorithm = (await git(directory, ['rev-parse', '--show-object-format'])).stdout.trim();
  if (!['sha1', 'sha256'].includes(algorithm)) throw new BlogError('未知 Git 对象格式。', 4);
  if (options.dryRun) {
    const files = await inventory(directory, algorithm);
    const changes = (await git(directory, ['-c', 'core.quotePath=false', 'status', '--short', '--untracked-files=all'])).stdout.trimEnd();
    return { status: 'PLANNED', remote, branch, changes, files: Object.keys(files).length, bytes: Object.values(files).reduce((sum, file) => sum + file.bytes, 0), commit: await head(directory), pushed: false };
  }
  await api.verifyRemote(remote);
  return withDataLocks(root, async () => {
    await assertNoPendingWrites(root);
    await ordinaryStore(root);
    await checkRemote(directory, remote);
    const before = await inventory(directory, algorithm);
    await git(directory, ['add', '--all', '--', '.']);
    const staged = (await git(directory, ['ls-files', '--stage', '-z'])).stdout.split('\0').filter(Boolean);
    const indexed = new Set<string>();
    for (const row of staged) {
      const match = /^(100644|100755) ([a-f0-9]+) 0\t([\s\S]+)$/.exec(row);
      if (!match || before[match[3]]?.blob !== match[2]) throw new BlogError('暂存内容与当前文件不同，保留暂存区，未提交。', 4);
      indexed.add(match[3]);
    }
    if (indexed.size !== Object.keys(before).length) throw new BlogError('忽略规则遗漏了资料文件，未提交；请核对资料仓库 .gitignore。', 4);
    if (stableJson(before) !== stableJson(await inventory(directory, algorithm))) throw new BlogError('备份期间文件变化，未提交；请保存后重试。', 4);
    const changed = (await git(directory, ['diff', '--cached', '--name-only'])).stdout.trim();
    if (changed) await git(directory, ['commit', '-m', 'save writing and persistent history']);
    const commit = await head(directory);
    if (!commit) return { status: 'UNCHANGED', pushed: false, commit: null };
    if (stableJson(before) !== stableJson(await inventory(directory, algorithm))) throw new BlogError('提交后文件又有变化；提交已保留，未推送，请重试。', 4);
    const tip = await checkRemote(directory, remote);
    if (tip === commit) return { status: 'UNCHANGED', pushed: false, commit };
    // A normal push also refuses a remote update racing the final baseline check.
    await git(directory, ['push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`]);
    return { status: 'BACKED_UP', pushed: true, commit, remote, branch, files: indexed.size };
  });
}
