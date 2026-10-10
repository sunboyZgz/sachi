import { BlogError, withLock, writeJson } from '../../src/lib/blog/files';
import type { BlogConfig, Manifest } from '../../src/lib/blog/schema';
import { cachePath, storePath } from './config';
import { activateRelease, remoteCurrent, uploadRelease } from './deploy';
import { recordToGit } from './git';
import { ensurePagesSettings, inspectPagesBranch, pagesStatus, pushPagesBranch, resolvePagesTarget, savePagesState, type PagesTarget } from './pages';
import { cacheCurrent } from './snapshot';
import { cachedManifest } from './state';

export async function releaseCurrent(root: string, config: BlogConfig, persist = false): Promise<Manifest | null> {
  if (config.deploy) return remoteCurrent(root, config);
  if (config.pages) {
    const result = await pagesStatus(root, config, { requireDeployed: true, persist });
    if (result.status === 'UNVERIFIED' && await inspectPagesBranch(root, result.target)) throw new BlogError('远端 blog 已存在，但本地没有已核实发布记录；请恢复对应 .blog-store，不会把未知分支当空站覆盖。', 4);
    if (result.manifest && persist) await cacheCurrent(root, result.manifest);
    return result.manifest;
  }
  return (await cachedManifest(root)).manifest;
}

export type DeliveryPlan = { server: 'ssh' | 'local' | 'SKIPPED'; pages: { target: PagesTarget; tip: string | null } | null; setupPages: boolean };
export async function deliveryPlan(root: string, config: BlogConfig, options: { 'pages-remote'?: string; 'setup-pages'?: boolean } = {}): Promise<DeliveryPlan> {
  const target = config.pages || options['pages-remote'] ? await resolvePagesTarget(root, config, options['pages-remote']) : null;
  if (!config.deploy && !target) throw new BlogError('没有部署目标；请配置 GitHub Pages 或 SSH。可先 build，不能把本地构建视为已上线。', 2);
  return { server: config.deploy?.type ?? 'SKIPPED', pages: target ? { target, tip: await inspectPagesBranch(root, target) } : null, setupPages: !!options['setup-pages'] };
}

/** Both configured hooks are attempted; successful targets are never rolled back on a sibling failure. */
export async function deliverRelease(root: string, config: BlogConfig, manifest: Manifest, directory: string, plan: DeliveryPlan, print: (status: string, data: unknown) => void) {
  const results: Record<string, unknown> = { server: { status: 'SKIPPED' }, pages: { status: 'SKIPPED' } };
  const errors: string[] = [];
  let serverError: unknown;
  if (config.deploy) {
    try {
      const current = await remoteCurrent(root, config);
      if (current?.releaseId !== manifest.releaseId) {
        if ((current?.releaseId ?? null) !== manifest.baseReleaseId) throw new BlogError('服务器基线变化；不能推送过期发布包。', 4);
        await uploadRelease(root, config, manifest, directory);
      }
      const result = await activateRelease(root, config, manifest);
      results.server = result;
      await cacheCurrent(root, manifest);
      try { await withLock(cachePath(root, 'git.lock'), () => recordToGit(root, config, manifest.releaseId, result)); }
      catch (error) {
        results.server = { ...result, backup: 'UNSYNCED' };
        serverError = new BlogError(`服务器已上线，Git 记录待 sync：${error instanceof Error ? error.message : String(error)}`, 8, 'DEPLOYED_UNSYNCED');
        errors.push((serverError as BlogError).message);
      }
    } catch (error) { serverError = error; results.server = { status: error instanceof BlogError ? error.status : 'UNKNOWN', reason: error instanceof Error ? error.message : String(error) }; errors.push('服务器部署未完成'); }
  }
  if (plan.pages) {
    try {
      const { target, tip } = plan.pages;
      await ensurePagesSettings(target, plan.setupPages);
      const result = await pushPagesBranch(root, target, directory, manifest, tip);
      await savePagesState(root, target, { manifest, commit: result.commit, repository: target.repository, url: target.url, status: 'QUEUED', checkedAt: new Date().toISOString() });
      results.pages = { ...result, remote: target.remote, actions: `https://github.com/${target.repository}/actions`, note: 'Git 推送完成；等待 Actions 构建与部署，再用 status --remote 核实上线。' };
    } catch (error) { results.pages = { status: error instanceof BlogError ? error.status : 'UNKNOWN', reason: error instanceof Error ? error.message : String(error), repository: plan.pages.target.repository, remote: plan.pages.target.remote, url: plan.pages.target.url }; errors.push('Pages 推送未完成'); }
  }
  const status = errors.length ? plan.pages ? 'PARTIAL_OR_FAILED' : serverError instanceof BlogError ? serverError.status : 'UNKNOWN' : plan.pages ? 'PUSHED' : 'DEPLOYED';
  const receipt = { ...(!plan.pages ? results.server as Record<string, unknown> : {}), status, releaseId: manifest.releaseId, at: new Date().toISOString(), hooks: results };
  await writeJson(storePath(root, 'receipts', `${manifest.releaseId}.json`), receipt);
  const retry = plan.pages ? `push ${manifest.releaseId} --pages-remote ${plan.pages.target.remote}` : `publish --resume ${manifest.releaseId}`;
  if (errors.length) throw new BlogError(`${!plan.pages && serverError instanceof Error ? serverError.message : errors.join('；')}。已成功的目标保留；修复后 ${retry} 重试同一冻结发布包。`, !plan.pages && serverError instanceof BlogError ? serverError.code : 8, status, receipt);
  print(status, receipt);
}
