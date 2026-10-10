import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlogError, sha256 } from '../../src/lib/blog/files';
import { manifestSchema, releaseIdSchema, type BlogConfig, type Manifest } from '../../src/lib/blog/schema';
import { cachePath } from './config';
import { run } from './process';

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
  await deployAction(root, config, 'prepare');
  const archiveDirectory = cachePath(root, 'uploads'); await mkdir(archiveDirectory, { recursive: true });
  const archive = path.join(archiveDirectory, `${manifest.releaseId}.tar`);
  await run(['tar', '-cf', archive, '-C', directory, '.'], { cwd: root, code: 7, env: { COPYFILE_DISABLE: '1' } });
  const remote = `${config.deploy.root}/staging/${manifest.releaseId}.tar`;
  if (config.deploy.type === 'local') await cp(archive, remote);
  else await run(['scp', '-B', '-o', 'StrictHostKeyChecking=yes', archive, `${config.deploy.host}:${remote}`], { cwd: root, code: 7 });
  return await deployAction(root, config, 'receive', { releaseId: manifest.releaseId, archiveHash: sha256(await readFile(archive)), checksumsHash: sha256(await readFile(path.join(directory, 'checksums.json'))) });
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
  return path.join(destination, 'verified', 'releases', id);
}
