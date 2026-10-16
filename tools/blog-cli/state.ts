import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BlogError, exists, readJson } from '../../src/lib/blog/files';
import { manifestSchema, type BlogConfig, type Manifest } from '../../src/lib/blog/schema';
import { cachePath, storePath } from './config';
import { downloadRelease, hydrateReleaseFiles } from './deploy';
import { verifyPackage } from './site';

export async function cachedManifest(root: string) {
  const file = storePath(root, 'current.json');
  if (!await exists(file)) return { manifest: null as Manifest | null, checkedAt: null as string | null, verified: false };
  const value = await readJson(file) as { manifest: unknown; checkedAt: string };
  return { manifest: value.manifest ? manifestSchema.parse(value.manifest) : null, checkedAt: value.checkedAt, verified: false };
}
export function freshDestination(root: string, value?: string) {
  if (!value) throw new BlogError('需要 --destination <新目录>。', 2);
  const destination = path.resolve(value);
  if (destination === root || root.startsWith(`${destination}${path.sep}`) || destination === '/' || destination === process.env.HOME) throw new BlogError('恢复目标不能是项目、祖先目录或主目录。', 2);
  return destination;
}
export async function hydrateCurrent(root: string, config: BlogConfig, current: Manifest | null) {
  if (!current) return;
  const missing = [];
  for (const entry of current.entries) if (!await exists(storePath(root, 'snapshots', entry.revisionHash, 'snapshot.json'))) missing.push(entry.id);
  for (const entry of current.series ?? []) if (!await exists(storePath(root, 'series-snapshots', entry.revisionHash, 'snapshot.json'))) missing.push(entry.id);
  if (!missing.length) return;
  if (!config.deploy) throw new BlogError('缺少旧发布快照；请从服务器或内容仓库恢复，不能用工作副本替代。', 3);
  const directory = await downloadRelease(root, config, current.releaseId, cachePath(root, 'recovery', `hydrate-${randomUUID()}`));
  await importRelease(root, directory, current, config);
}
export async function importRelease(root: string, directory: string, manifest: Manifest, config?: BlogConfig) {
  if (await exists(path.join(directory, 'yandu-recovery.json'))) {
    if (!config) throw new BlogError('导入此发布需要原 Yandu 项目配置，不能用当前工作副本补齐缺失快照。', 2, 'INPUT_REQUIRED');
    await hydrateReleaseFiles(root, config, directory);
  }
  await verifyPackage(directory);
  await mkdir(storePath(root, 'snapshots'), { recursive: true });
  for (const entry of manifest.entries) if (!await exists(storePath(root, 'snapshots', entry.revisionHash))) await cp(path.join(directory, 'snapshots', entry.revisionHash), storePath(root, 'snapshots', entry.revisionHash), { recursive: true });
  for (const entry of manifest.series ?? []) if (!await exists(storePath(root, 'series-snapshots', entry.revisionHash))) await cp(path.join(directory, 'series-snapshots', entry.revisionHash), storePath(root, 'series-snapshots', entry.revisionHash), { recursive: true });
  if (!await exists(storePath(root, 'code', manifest.codeHash))) await cp(path.join(directory, 'code'), storePath(root, 'code', manifest.codeHash), { recursive: true });
}
