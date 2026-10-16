import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { defaultConfig } from '../../src/lib/blog/schema';
import { exists, writeJson } from '../../src/lib/blog/files';
import { scanContent } from '../../src/lib/blog/content';
import { newPost } from '../blog-cli/writing';
import { run } from '../blog-cli/process';
import * as processTools from '../blog-cli/process';
import { backupWriting, initializeBackup, type BackupServices } from './backup';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const git = (cwd: string, ...args: string[]) => run(['git', '-c', 'core.hooksPath=/dev/null', ...args], { cwd });
// Only injected test services admit temporary local remotes; the real entrypoint requires GitHub private=true.
const local: BackupServices = { verifyRemote: async (remote) => { if (!path.isAbsolute(remote)) throw Error('not a temporary local remote'); } };
async function fixture() {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sachi-private-backup-'))); roots.push(parent);
  const root = path.join(parent, 'project'), remote = path.join(parent, 'remote.git'); await mkdir(root);
  await git(parent, 'init', '--bare', remote);
  await git(root, 'init', '--initial-branch=codex/test'); await git(root, 'config', 'user.name', 'Local Test'); await git(root, 'config', 'user.email', 'test@localhost');
  await writeFile(path.join(root, '.gitignore'), '.blog-store/\n.blog/\n');
  await writeFile(path.join(root, 'code.txt'), 'code'); await git(root, 'add', '.'); await git(root, 'commit', '-m', 'code');
  await writeFile(path.join(root, 'code.txt'), 'staged code'); await git(root, 'add', 'code.txt');
  const config = defaultConfig('Asia/Shanghai'); await writeJson(path.join(root, 'blog.config.json'), config);
  const post = await newPost(root, config, { category: 'life', title: '私有文章' });
  const directory = path.join(root, '.blog-store');
  const outer = (await git(root, 'diff', '--cached')).stdout;
  return { root, remote, directory, post, parent, outer, config };
}
async function initialize(f: Awaited<ReturnType<typeof fixture>>) {
  await initializeBackup(f.root, f.remote, local);
  await git(f.directory, 'config', 'user.name', 'Local Test'); await git(f.directory, 'config', 'user.email', 'test@localhost');
}
describe('independent nested writing repository', () => {
  it('never discovers or mutates the outer Git repository when the inner one is absent', async () => {
    const f = await fixture(); await expect(backupWriting(f.root, { dryRun: true }, local)).rejects.toThrow('外层仓库');
    expect((await git(f.root, 'diff', '--cached')).stdout).toBe(f.outer);
    expect(await exists(path.join(f.directory, '.git'))).toBe(false);
    await expect(initializeBackup(f.root, f.remote, { verifyRemote: async () => { throw Error('public'); } })).rejects.toThrow('public');
    expect(await exists(path.join(f.directory, '.git'))).toBe(false);
    await git(f.directory, 'init', '--initial-branch=codex/writing-backup');
    await initialize(f);
    expect((await git(f.directory, 'remote', 'get-url', 'origin')).stdout.trim()).toBe(f.remote);
  });

  it('backs up additions, edits and deletions, is idempotent, and restores into a clean project', async () => {
    const f = await fixture(); await initialize(f);
    await writeJson(path.join(f.directory, 'receipts/history.json'), { remembered: true });
    const planned = await backupWriting(f.root, { dryRun: true }, local);
    expect(planned.status).toBe('PLANNED'); expect(planned.commit).toBe(null);
    expect((await git(f.parent, 'ls-remote', f.remote)).stdout).toBe('');
    const first = await backupWriting(f.root, {}, local); expect(first.status).toBe('BACKED_UP');
    expect((await backupWriting(f.root, {}, local)).status).toBe('UNCHANGED');
    const file = path.join(f.root, f.post.file); await writeFile(file, (await readFile(file, 'utf8')) + '\n真实修改\n');
    await writeFile(path.join(f.directory, 'content/extra.txt'), '额外资料');
    expect((await backupWriting(f.root, {}, local)).status).toBe('BACKED_UP');
    await rm(path.join(f.directory, 'content/extra.txt'));
    const latest = await backupWriting(f.root, {}, local); expect(latest.commit).not.toBe(first.commit);
    expect((await git(f.root, 'diff', '--cached')).stdout).toBe(f.outer);
    expect((await git(f.root, 'branch', '--show-current')).stdout.trim()).toBe('codex/test');
    const restored = path.join(f.parent, 'restored'); await mkdir(restored);
    await writeJson(path.join(restored, 'blog.config.json'), f.config);
    await git(f.parent, 'clone', '--branch', 'codex/writing-backup', f.remote, path.join(restored, '.blog-store'));
    const posts = await scanContent(restored, f.config); expect(posts.posts[0].post.id).toBe(f.post.id);
    expect(posts.posts[0].raw).toContain('真实修改'); expect(posts.issues).toEqual([]);
    expect(await readFile(path.join(restored, '.blog-store/receipts/history.json'), 'utf8')).toContain('remembered');
  });

  it('retains commits after a failed push and uploads them on the next run without an empty commit', async () => {
    const f = await fixture(); await initialize(f);
    await git(f.parent, '--git-dir', f.remote, 'config', 'receive.denyCurrentBranch', 'refuse');
    // A bare remote can reject receives without invoking any user hooks.
    await git(f.parent, '--git-dir', f.remote, 'config', 'receive.denyNonFastForwards', 'true');
    await rename(f.remote, `${f.remote}.offline`);
    await expect(backupWriting(f.root, {}, local)).rejects.toThrow();
    await rename(`${f.remote}.offline`, f.remote);
    await backupWriting(f.root, {}, local);
    const initial = (await git(f.directory, 'rev-parse', 'HEAD')).stdout;
    await writeFile(path.join(f.directory, 'note.txt'), 'retry');
    // Force push failure after committing by pointing the push transport at a failing executable.
    await git(f.directory, 'config', 'remote.origin.receivepack', 'false');
    await expect(backupWriting(f.root, {}, local)).rejects.toThrow();
    const saved = (await git(f.directory, 'rev-parse', 'HEAD')).stdout; expect(saved).not.toBe(initial);
    await git(f.directory, 'config', '--unset', 'remote.origin.receivepack');
    expect((await backupWriting(f.root, {}, local)).status).toBe('BACKED_UP');
    expect((await git(f.directory, 'rev-parse', 'HEAD')).stdout).toBe(saved);
  });

  it('detects editor changes during staging before committing and refuses multiple push destinations', async () => {
    const f = await fixture(); await initialize(f);
    const actualRun = processTools.run;
    vi.spyOn(processTools, 'run').mockImplementation(async (command, options) => {
      const result = await actualRun(command, options);
      if (command[0] === 'git' && command[3] === 'add' && options.cwd === f.directory) await writeFile(path.join(f.directory, 'concurrent.txt'), 'an editor changed the tree');
      return result;
    });
    await expect(backupWriting(f.root, {}, local)).rejects.toThrow('备份期间文件变化');
    vi.restoreAllMocks();
    await expect(git(f.directory, 'rev-parse', '--verify', 'HEAD')).rejects.toThrow();
    await git(f.directory, 'config', '--add', 'remote.origin.pushurl', f.remote);
    await git(f.directory, 'config', '--add', 'remote.origin.pushurl', `${f.remote}.other`);
    await expect(backupWriting(f.root, { dryRun: true }, local)).rejects.toThrow('有且只有一个');
    expect((await git(f.root, 'diff', '--cached')).stdout).toBe(f.outer);
  });

  it('refuses remote divergence, symlinks, missing ignored data and wrong branches without touching outer staged work', async () => {
    const f = await fixture(); await initialize(f); await backupWriting(f.root, {}, local);
    const other = path.join(f.parent, 'other'); await git(f.parent, 'clone', '--branch', 'codex/writing-backup', f.remote, other);
    await git(other, 'config', 'user.name', 'Other'); await git(other, 'config', 'user.email', 'other@localhost');
    await writeFile(path.join(other, 'remote.txt'), 'other device'); await git(other, 'add', '.'); await git(other, 'commit', '-m', 'other'); await git(other, 'push', 'origin', 'HEAD');
    await expect(backupWriting(f.root, {}, local)).rejects.toThrow('远端有');
    expect((await git(f.root, 'diff', '--cached')).stdout).toBe(f.outer);
    const g = await fixture(); await initialize(g);
    await writeFile(path.join(g.directory, '.gitignore'), 'content/\n');
    await expect(backupWriting(g.root, {}, local)).rejects.toThrow('遗漏');
    await writeFile(path.join(g.directory, '.gitignore'), '');
    const { symlink } = await import('node:fs/promises'); await symlink(path.join(g.root, 'code.txt'), path.join(g.directory, 'linked.txt'));
    await expect(backupWriting(g.root, {}, local)).rejects.toThrow('普通文件');
    await rm(path.join(g.directory, 'linked.txt'));
    await git(g.directory, 'symbolic-ref', 'HEAD', 'refs/heads/codex/wrong');
    await expect(backupWriting(g.root, { dryRun: true }, local)).rejects.toThrow('其他分支');
  });
});
