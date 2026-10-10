import path from 'node:path';
import { cp, mkdir, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { BlogError, exists, readJson, withLock } from '../../../src/lib/blog/files';
import { cachePath, storePath } from '../config';
import { downloadRelease, remoteCurrent } from '../deploy';
import { backupPlan, recordToGit, restoreGit, syncContent } from '../git';
import { cacheCurrent } from '../snapshot';
import { freshDestination, importRelease } from '../state';
import type { CommandContext } from '../context';
export async function executeBackup(context: CommandContext): Promise<boolean> {
  const { root, config, invocation, print, confirm } = context;
  const { command, options } = invocation;
  if (command === 'restore') {
    if (!config.git) throw new BlogError('没有配置 Git 内容仓库，不能从 Git 恢复。', 2);
    const destination = freshDestination(root, options.destination);
    if (await exists(destination)) throw new BlogError('恢复目标必须是尚不存在的新目录。', 2);
    if (options['dry-run']) { print('PLANNED', { destination, remote: config.git?.remote ?? null }); return true; }
    await confirm(`从 Git 恢复到新目录 ${destination}，不覆盖当前写作目录。`);
    print('RESTORED', await withLock(cachePath(root, 'git.lock'), () => restoreGit(root, config, destination))); return true;
  }
  if (command === 'recover') {
    const destination = freshDestination(root, options.destination);
    if (await exists(destination)) throw new BlogError('恢复目标必须是尚不存在的新目录。', 2);
    const current = await remoteCurrent(root, config); if (!current) throw new BlogError('服务器没有当前发布。', 2);
    if (options['dry-run']) { print('PLANNED', { destination, releaseId: current.releaseId }); return true; }
    await confirm(`恢复服务器当前公开版本到 ${destination}；不会恢复未备份的草稿。`);
    const directory = await downloadRelease(root, config, current.releaseId, cachePath(root, 'recovery', `recover-${randomUUID()}`));
    await importRelease(root, directory, current);
    await mkdir(destination);
    for (const entry of current.entries) {
      const snap = storePath(root, 'snapshots', entry.revisionHash);
      const source = path.join(destination, entry.sourcePath); await mkdir(path.dirname(source), { recursive: true }); await cp(path.join(snap, 'source.md'), source);
      if (await exists(path.join(snap, 'files'))) await cp(path.join(snap, 'files'), entry.sourcePath.endsWith('/index.md') ? path.dirname(source) : path.join(destination, 'public'), { recursive: true });
      const snapshot = await readJson(path.join(snap, 'snapshot.json')) as { media: { assets: Record<string, unknown> } };
      if (Object.keys(snapshot.media.assets).length) {
        const { stringify } = await import('yaml');
        const { atomicWrite } = await import('../../../src/lib/blog/files');
        await atomicWrite(path.join(path.dirname(source), 'media.yaml'), stringify(snapshot.media));
      }
    }
    for (const entry of current.series ?? []) {
      const source = path.join(destination, 'content', 'series', `${entry.id}.yaml`);
      await mkdir(path.dirname(source), { recursive: true });
      await cp(storePath(root, 'series-snapshots', entry.revisionHash, 'source.yaml'), source);
    }
    await cacheCurrent(root, current);
    print('RESTORED', { destination, releaseId: current.releaseId, note: '仅包含已公开快照。网站代码与发布包已恢复到本项目持久存储。' }); return true;
  }
  if (command === 'sync') {
    const plan = await backupPlan(root, config);
    if (options['dry-run']) { print('PLANNED', { ...plan, git: config.git ? 'enabled' : 'disabled' }); return true; }
    if (!config.git) { print('SKIPPED', '未配置 Git 内容仓库，没有提交或推送；写作和本地构建不受影响。'); return true; }
    await confirm(`同步全部写作备份，不上线：${JSON.stringify(plan)}`);
    const result = await withLock(cachePath(root, 'git.lock'), async () => {
      const saved = await syncContent(root, config, plan);
      const receipts = storePath(root, 'receipts');
      if (await exists(receipts)) for (const file of await readdir(receipts)) if (file.endsWith('.json')) {
        const record = await readJson(path.join(receipts, file)) as { status: string };
        if (record.status !== 'BUILD_ONLY') await recordToGit(root, config, path.basename(file, '.json'), record);
      }
      return saved;
    });
    print(result.status, result); return true;
  }

  return false;
}
