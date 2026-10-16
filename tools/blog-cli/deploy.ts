import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { BlogError, exists, inside, readJson, safeDirectory, safeFile, sha256, walk, writeJson } from '../../src/lib/blog/files';
import { hashSchema, manifestSchema, releaseIdSchema, type BlogConfig, type Manifest } from '../../src/lib/blog/schema';
import { resourceRefSchema, resourceUrl, type ResourceRef } from '../../src/lib/blog/yandu';
import { cachePath } from './config';
import { run } from './process';
import { checksums } from './snapshot';
import { verifyPackage } from './site';

const recoveryPathSchema = z.string().min(1).refine((value) => path.posix.normalize(value) === value && !value.includes('\\') && !value.includes('\0') && !value.split('/').includes('..') && (value === 'checksums.json' || ['snapshots/', 'series-snapshots/', 'code/'].some((prefix) => value.startsWith(prefix))), '恢复文件路径越界。');
const recoverySchema = z.strictObject({
  schemaVersion: z.literal(1), releaseId: releaseIdSchema, checksumsHash: hashSchema,
  files: z.array(z.strictObject({ path: recoveryPathSchema, resource: resourceRefSchema })).max(100_000),
});

/** The server keeps public output and identities; private recovery bytes stay in Yandu. */
async function prepareServerPackage(root: string, config: BlogConfig, manifest: Manifest, directory: string, uploads: string) {
  if (!config.yandu) return directory;
  const { uploadImmutable } = await import('./yandu');
  await verifyPackage(directory);
  const files = [];
  for (const relative of await walk(directory)) {
    if (relative.startsWith('site/') || ['release.json', 'resource-allowlist.json'].includes(relative)) continue;
    recoveryPathSchema.parse(relative);
    const bytes = await readFile(await safeFile(directory, relative));
    files.push({ path: relative, resource: await uploadImmutable(root, config, `archives/releases/${manifest.releaseId}`, path.basename(relative), bytes) });
  }
  const lean = await mkdtemp(path.join(uploads, `${manifest.releaseId}-`));
  await cp(path.join(directory, 'site'), path.join(lean, 'site'), { recursive: true });
  for (const name of ['release.json', 'resource-allowlist.json']) if (await exists(path.join(directory, name))) await cp(path.join(directory, name), path.join(lean, name));
  await writeJson(path.join(lean, 'yandu-recovery.json'), recoverySchema.parse({ schemaVersion: 1, releaseId: manifest.releaseId, checksumsHash: sha256(await readFile(path.join(directory, 'checksums.json'))), files }));
  await checksums(lean);
  return lean;
}

export async function hydrateReleaseFiles(root: string, config: BlogConfig, directory: string) {
  const descriptor = path.join(directory, 'yandu-recovery.json');
  if (!await exists(descriptor)) return;
  await verifyPackage(directory);
  if (!config.yandu) throw new BlogError('该发布只在服务器保留静态产物；请配置原 Yandu 项目与私有读取凭证后恢复写作资料。', 2, 'INPUT_REQUIRED');
  const recovery = recoverySchema.parse(await readJson(descriptor));
  const manifest = manifestSchema.parse(await readJson(path.join(directory, 'release.json')));
  if (recovery.releaseId !== manifest.releaseId) throw new BlogError('Yandu 恢复资料与发布版本不一致。', 3);
  const names = new Set<string>();
  let total = 0;
  for (const file of recovery.files) {
    if (names.has(file.path)) throw new BlogError('Yandu 恢复清单包含重复文件。', 3);
    names.add(file.path); total += file.resource.bytes;
    if (file.resource.projectId !== config.yandu.projectId || total > 20 * 1024 ** 3) throw new BlogError('Yandu 恢复项目或文件总量不匹配。', 3);
  }
  const originalChecksums = recovery.files.find((file) => file.path === 'checksums.json');
  if (!originalChecksums || originalChecksums.resource.sha256 !== recovery.checksumsHash) throw new BlogError('Yandu 恢复清单缺少可信原始摘要。', 3);
  const { YanduStorage } = await import('./yandu');
  const storage = new YanduStorage(root, config);
  for (const file of recovery.files.filter((file) => file.path !== 'checksums.json')) {
    const parent = path.posix.dirname(file.path);
    if (parent !== '.') await safeDirectory(directory, parent);
    await storage.download(file.resource, inside(directory, file.path));
  }
  // Restore the original checksum descriptor only after every private file has
  // passed the adapter's streamed SHA256 and size verification.
  await storage.download(originalChecksums.resource, path.join(directory, 'checksums.json'));
  if (sha256(await readFile(path.join(directory, 'checksums.json'))) !== recovery.checksumsHash) throw new BlogError('原始发布摘要恢复失败。', 3);
  await rm(descriptor);
  await verifyPackage(directory);
}

const agentFile = fileURLToPath(new URL('./deploy-agent.py', import.meta.url));
type Response = { status: string; error?: string; code?: number; manifest?: Manifest | null; records?: unknown[]; path?: string; hash?: string; [key: string]: unknown };
export function shellQuote(value: string) { return `'${value.replaceAll("'", "'\\''")}'`; }
export async function deployAction(root: string, config: BlogConfig, action: string, payload: Record<string, unknown> = {}): Promise<Response> {
  if (!config.deploy) throw new BlogError('尚未配置部署。可以先运行 blog build 生成本地发布包。', 2);
  const encoded = Buffer.from(JSON.stringify({ ...payload, siteUrl: config.deploy.type === 'ssh' ? config.siteUrl : null })).toString('base64');
  const script = await readFile(agentFile, 'utf8');
  const command = config.deploy.type === 'local'
    ? ['python3', '-', config.deploy.root, action, encoded]
    : ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', config.deploy.host, `python3 - ${shellQuote(config.deploy.root)} ${shellQuote(action)} ${shellQuote(encoded)}`];
  const result = JSON.parse((await run(command, { cwd: root, input: script, code: 7, timeout: 60_000 })).stdout) as Response;
  if (result.error) throw new BlogError(result.error, result.code ?? 7, result.status);
  if (result.manifest) result.manifest = manifestSchema.parse(result.manifest);
  return result;
}
export async function remoteCurrent(root: string, config: BlogConfig) {
  const result = await deployAction(root, config, 'current');
  return result.manifest ?? null;
}
export async function uploadRelease(root: string, config: BlogConfig, manifest: Manifest, directory: string) {
  if (!config.deploy) throw new BlogError('尚未配置部署。', 2);
  await verifyPackage(directory);
  if (config.yandu) {
    const active = new Set([...manifest.entries.map((entry) => entry.id), 'profile']);
    const resources = new Map<string, ResourceRef>();
    for (const resource of [...manifest.resources ?? [], ...manifest.retainedResources?.filter((item) => active.has(item.ownerId)).map((item) => item.resource) ?? []]) resources.set(`${resource.projectId}:${resourceUrl(resource)}`, resource);
    const { YanduStorage } = await import('./yandu');
    const storage = new YanduStorage(root, config);
    for (const resource of resources.values()) await storage.verify(resource);
  }
  await deployAction(root, config, 'prepare');
  const archiveDirectory = cachePath(root, 'uploads'); await mkdir(archiveDirectory, { recursive: true });
  const serverPackage = await prepareServerPackage(root, config, manifest, directory, archiveDirectory);
  const archive = path.join(archiveDirectory, `${manifest.releaseId}.tar`);
  await run(['tar', '-cf', archive, '-C', serverPackage, '.'], { cwd: root, code: 7, env: { COPYFILE_DISABLE: '1' } });
  const remote = `${config.deploy.root}/staging/${manifest.releaseId}.tar`;
  if (config.deploy.type === 'local') await cp(archive, remote);
  else await run(['scp', '-B', '-o', 'StrictHostKeyChecking=yes', archive, `${config.deploy.host}:${remote}`], { cwd: root, code: 7 });
  const result = await deployAction(root, config, 'receive', { releaseId: manifest.releaseId, archiveHash: sha256(await readFile(archive)), checksumsHash: sha256(await readFile(path.join(serverPackage, 'checksums.json'))) });
  if (serverPackage !== directory) await rm(serverPackage, { recursive: true, force: true });
  return result;
}
export async function activateRelease(root: string, config: BlogConfig, manifest: Manifest) {
  try { return await deployAction(root, config, 'activate', { releaseId: manifest.releaseId, baseReleaseId: manifest.baseReleaseId }); }
  catch (error) {
    if (error instanceof BlogError && ['FAILED_ROLLED_BACK', 'ERROR'].includes(error.status) && error.code !== 7) throw error;
    if (error instanceof BlogError && error.status === 'FAILED_ROLLED_BACK') throw error;
    try {
      const actual = await remoteCurrent(root, config);
      if (actual?.releaseId === manifest.releaseId) return { status: 'DEPLOYED', manifest: actual, recoveredConnection: true };
      if (actual?.releaseId === manifest.baseReleaseId || (!actual && !manifest.baseReleaseId)) throw new BlogError('服务器未切换到本次版本；线上原版本保持不变，可重试。', 7, 'NOT_DEPLOYED');
      throw new BlogError('服务器基线已变化，请重新检查状态。', 4);
    } catch (queryError) {
      if (queryError instanceof BlogError && ['NOT_DEPLOYED', 'ERROR'].includes(queryError.status) && queryError.code === 4) throw queryError;
      if (queryError instanceof BlogError && queryError.status === 'NOT_DEPLOYED') throw queryError;
      throw new BlogError(`切换结果待核实。使用 publish --resume ${manifest.releaseId} 或 status --remote 查询，不能推断未上线。`, 7, 'UNKNOWN');
    }
  }
}
export async function downloadRelease(root: string, config: BlogConfig, id: string, destination: string) {
  releaseIdSchema.parse(id);
  const exported = await deployAction(root, config, 'export', { releaseId: id });
  const archive = path.join(destination, 'restore.tar'); await mkdir(destination, { recursive: true });
  if (config.deploy?.type === 'local') await cp(String(exported.path), archive);
  else if (config.deploy?.type === 'ssh') await run(['scp', '-B', '-o', 'StrictHostKeyChecking=yes', `${config.deploy.host}:${String(exported.path)}`, archive], { cwd: root, code: 7 });
  if (sha256(await readFile(archive)) !== exported.hash) throw new BlogError('恢复包摘要不匹配。', 3);
  // Reuse the hardened receiver rather than blindly extracting a downloaded tar.
  const temporaryConfig: BlogConfig = { ...config, deploy: { type: 'local', root: path.join(destination, 'verified') } };
  await deployAction(root, temporaryConfig, 'prepare');
  await cp(archive, path.join(destination, 'verified', 'staging', `${id}.tar`));
  // The checksum descriptor comes from the trusted server release, not a local guess.
  const descriptor = await deployAction(root, config, 'manifest', { releaseId: id });
  if (!descriptor.manifest) throw new BlogError('服务器缺少发布清单。');
  const listing = (await run(['tar', '-xOf', archive, './checksums.json'], { cwd: root, code: 3 })).stdout;
  await deployAction(root, temporaryConfig, 'receive', { releaseId: id, archiveHash: exported.hash, checksumsHash: sha256(listing) });
  const directory = path.join(destination, 'verified', 'releases', id);
  await hydrateReleaseFiles(root, config, directory);
  return directory;
}
