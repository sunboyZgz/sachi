import { logicalSourcePath } from '../../../src/lib/blog/storage';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { scanContent, selectPosts } from '../../../src/lib/blog/content';
import { BlogError, exists, readJson, withLock, writeJson } from '../../../src/lib/blog/files';
import { configSchema, manifestSchema, releaseIdSchema, type Manifest } from '../../../src/lib/blog/schema';
import { cachePath, storePath } from '../config';
import { deployAction, remoteCurrent } from '../deploy';
import { saveReleaseToGit } from '../git';
import { createPlan, validateArticleLinks } from '../plan';
import { buildRelease, copyExport, verifyPackage } from '../site';
import { cacheCurrent, codeBaseline, readSnapshot, saveSnapshot } from '../snapshot';
import { validateMedia } from '../media';
import { cachedManifest, hydrateCurrent } from '../state';
import { describePlan } from '../reporter';
import type { CommandContext } from '../context';
import { deliverRelease, deliveryPlan, releaseCurrent } from '../delivery';
import { pagesStatus } from '../pages';
import { scanSeries, selectSeries } from '../../../src/lib/blog/series';
import { saveSeriesSnapshot } from '../series';
export async function executeReleases(context: CommandContext): Promise<boolean> {
  const { root, config, invocation, prompts, print, confirm } = context;
  const { command, selectors, options } = invocation;
  if (command === 'history') {
    if (options.remote) { print('VERIFIED', { server: config.deploy ? await deployAction(root, config, 'history') : 'SKIPPED', pages: config.pages ? await pagesStatus(root, config) : 'SKIPPED' }); return true; }
    const directory = storePath(root, 'receipts');
    const records = await exists(directory) ? await Promise.all((await readdir(directory)).filter((name) => name.endsWith('.json')).map((name) => readJson(path.join(directory, name)))) : [];
    print('CACHED', { records, note: '本地记录不等于已核实的服务器状态。' }); return true;
  }
  if (command === 'rollback') {
    if (config.pages) throw new BlogError('自动 rollback 当前仅支持服务器，不会只回滚其中一个目标。Pages 请在 Actions 重跑目标历史提交的部署，并核实站点；随后同步对应发布记录。', 2);
    const target = releaseIdSchema.parse(options.to);
    const current = await remoteCurrent(root, config);
    const response = await deployAction(root, config, 'manifest', { releaseId: target });
    if (!response.manifest) throw new BlogError('回滚版本不存在。');
    const plan = { from: current?.releaseId ?? null, to: target, restored: response.manifest.entries.map((entry) => ({ id: entry.id, title: entry.title })), removed: current?.entries.filter((entry) => !response.manifest!.entries.some((target) => target.id === entry.id)) ?? [] };
    if (options['dry-run']) { print('PLANNED', plan); return true; }
    if (!options.json) print('PLANNED', plan);
    await confirm('将执行以上整站回滚；本地文章保持不变。');
    const operationId = `r-${randomUUID()}`;
    try {
      const result = await deployAction(root, config, 'rollback', { releaseId: target, baseReleaseId: current?.releaseId ?? null, operationId });
      await cacheCurrent(root, response.manifest);
      await writeJson(storePath(root, 'receipts', `${operationId}.json`), result);
      print('DEPLOYED', result);
    } catch (error) { if (error instanceof BlogError && error.code === 7 && error.status === 'ERROR') throw new BlogError(`回滚结果待核实：${target}。请执行 status --remote。`, 7, 'UNKNOWN'); throw error; }
    return true;
  }
  if (command === 'push') {
    if (selectors.length !== 1) throw new BlogError('push 需要明确的 release-id；终端中不带参数可选择已构建版本。', 2, 'INPUT_REQUIRED');
    const id = releaseIdSchema.parse(selectors[0]);
    const directory = storePath(root, 'releases', id);
    await verifyPackage(directory);
    const manifest = manifestSchema.parse(await readJson(path.join(directory, 'release.json')));
    const targets = await deliveryPlan(root, config, options);
    if (options['dry-run']) { print('PLANNED', { releaseId: id, ...targets, note: '只推送冻结发布包；不提交或推送 main，不读取当前草稿。' }); return true; }
    await confirm(`推送冻结发布 ${id}：服务器 ${targets.server}；Pages ${targets.pages?.target.repository ?? 'SKIPPED'}（blog 分支）。\n${targets.setupPages ? '将显式启用 GitHub Actions Pages 发布源。\n' : ''}main 保持不变；Pages 分支代码和本次发布内容将公开。`);
    await withLock(cachePath(root, 'publish.lock'), () => deliverRelease(root, config, manifest, directory, targets, print));
    return true;
  }
  if (command === 'publish' && options.resume) {
    const id = releaseIdSchema.parse(options.resume);
    const packageDirectory = storePath(root, 'releases', id);
    const builtAlready = await exists(path.join(packageDirectory, 'checksums.json'));
    const manifest = builtAlready
      ? manifestSchema.parse(await readJson(path.join(packageDirectory, 'release.json')))
      : manifestSchema.parse((await readJson(storePath(root, 'plans', `${id}.json`)) as { manifest: Manifest }).manifest);
    if (builtAlready) await verifyPackage(packageDirectory);
    const current = await releaseCurrent(root, config);
    if (current?.releaseId !== id && (current?.releaseId ?? null) !== manifest.baseReleaseId) throw new BlogError('服务器基线已变化，不能恢复此旧计划。', 4);
    const targets = await deliveryPlan(root, config, options);
    if (options['dry-run']) { print('PLANNED', { releaseId: id, current: current?.releaseId ?? null, ...targets }); return true; }
    await confirm(`恢复冻结发布 ${id}，不重新读取当前文章。`);
    await withLock(cachePath(root, 'publish.lock'), async () => {
      if (!builtAlready) {
        const frozenConfig = configSchema.parse(await readJson(storePath(root, 'code', manifest.codeHash, 'blog.config.json')));
        const buildConfig = { ...config, yandu: frozenConfig.yandu ? { ...frozenConfig.yandu, credentialFile: config.yandu?.credentialFile ?? frozenConfig.yandu.credentialFile } : null, timezone: frozenConfig.timezone, media: frozenConfig.media, siteAssets: frozenConfig.siteAssets, siteUrl: frozenConfig.siteUrl, buildCommand: frozenConfig.buildCommand };
        const frozenPlan = await readJson(storePath(root, 'plans', `${id}.json`)) as { selected: string[]; selectedSeries?: string[] };
        await withLock(cachePath(root, 'git.lock'), () => saveReleaseToGit(root, config, manifest, frozenPlan.selected, frozenPlan.selectedSeries));
        await buildRelease(root, buildConfig, manifest, { echo: !options.json });
      }
      await deliverRelease(root, config, manifest, packageDirectory, targets, print);
    }); return true;
  }

  if (!['build', 'publish', 'unpublish'].includes(command!)) return false;
  const scanned = await scanContent(root, config);
  if (!selectors.length && !options.series?.length) throw new BlogError(`${command} 必须显式选择文章或系列资料，不能默认发布全部草稿。`, 2);
  if (scanned.issues.length) throw new BlogError(scanned.issues.map((issue) => `${issue.file}: ${issue.message}`).join('\n'));
  const current = command === 'build' ? (config.deploy ? await remoteCurrent(root, config) : (await cachedManifest(root)).manifest) : await releaseCurrent(root, config);
  const selected = command === 'unpublish' ? [] : selectPosts(scanned.posts, selectors);
  for (const source of selected) await validateMedia(root, config, source.dependencies, source.post.flow);
  const withdrawn = command === 'unpublish' ? selectors.map((selector) => {
    const entry = current?.entries.find((entry) => entry.id === selector || entry.slug === selector || entry.sourcePath === logicalSourcePath(selector) || entry.sourcePath.replace(/\/index.md$/, '') === logicalSourcePath(selector));
    if (!entry) throw new BlogError(`当前未发布：${selector}`); return entry.id;
  }) : [];
  const baseline = await codeBaseline(root, config);
  const catalogue = await scanSeries(root);
  if (catalogue.issues.length) throw new BlogError(JSON.stringify(catalogue.issues));
  const seriesIds = [...new Set([...selected.flatMap((source) => source.post.series ? [source.post.series.id] : []), ...options.series ?? []])];
  const chosenSeries = command === 'unpublish' ? [] : selectSeries(catalogue.series, seriesIds);
  const plan = createPlan(current, selected, scanned.posts, baseline, withdrawn, new Date(), chosenSeries);
  const knownBodies = selected.map((source) => source.post);
  const pendingSnapshotChecks: string[] = [];
  for (const entry of plan.manifest.entries.filter((entry) => !plan.selected.includes(entry.id))) {
    if (await exists(storePath(root, 'snapshots', entry.revisionHash, 'snapshot.json'))) knownBodies.push((await readSnapshot(root, entry.revisionHash)).post);
    else pendingSnapshotChecks.push(entry.id);
  }
  validateArticleLinks(plan.manifest, knownBodies);
  if (options['dry-run']) { print('PLANNED', { ...plan, git: config.git ? 'enabled' : 'skipped', deploy: config.deploy?.type ?? 'unconfigured', delivery: command !== 'build' && (config.pages || config.deploy) ? await deliveryPlan(root, config, options) : null, pendingSnapshotChecks, note: pendingSnapshotChecks.length ? '旧快照缺失；执行时须从服务器恢复并完成全站检查，不能视为已通过构建。' : '计划与已知引用已检查；未执行构建或上线。' }); return true; }
  if (command !== 'build' && !config.deploy && !config.pages) throw new BlogError('尚未配置部署。请先用 build 检查本地发布包，不能将它视为已上线。', 2);
  const targets = command === 'build' ? null : await deliveryPlan(root, config, options);
  if (plan.baselineChanged && !options['accept-baseline']) {
    if (invocation.guided && prompts.enabled) {
      print('PLANNED', plan);
      if (!await prompts.confirm('接受全站代码/配置基线更新？未选文章仍使用旧快照。（默认取消）')) throw new BlogError('未接受全站基线更新，已取消。', 130, 'CANCELLED');
    } else throw new BlogError('网站代码/配置基线已变化；检查计划后使用 --accept-baseline 接受整站基线更新。未选文章仍使用旧快照。', 4);
  }
  await confirm(`${describePlan(plan)}${withdrawn.length ? '\n本次撤回：' + withdrawn.map((id) => current!.entries.find((entry) => entry.id === id)!.title).join('、') : ''}\n${command === 'build' ? '仅构建，不上线。' : `服务器 ${targets!.server}；Pages ${targets!.pages?.target.repository ?? 'SKIPPED'}（blog 分支）；main 保持不变。`}${targets?.setupPages ? '\n将显式启用 GitHub Actions Pages 发布源。' : ''}`);
  await withLock(cachePath(root, 'publish.lock'), async () => {
    await hydrateCurrent(root, config, current);
    const frozenCode = await codeBaseline(root, config, true);
    if (frozenCode.hash !== baseline.hash) throw new BlogError('确认后代码或全局资源变化，未执行发布。', 4);
    for (const source of selected) await saveSnapshot(root, config, source);
    for (const source of chosenSeries) await saveSeriesSnapshot(root, source);
    await writeJson(storePath(root, 'plans', `${plan.manifest.releaseId}.json`), plan);
    if (command !== 'build') await withLock(cachePath(root, 'git.lock'), () => saveReleaseToGit(root, config, plan.manifest, plan.selected, plan.selectedSeries));
    const built = await buildRelease(root, config, plan.manifest, { echo: !options.json });
    if (command === 'build') {
      if (options.export) await copyExport(built.directory, root);
      const receipt = { status: 'BUILD_ONLY', releaseId: built.manifest.releaseId, directory: built.directory, builtAt: new Date().toISOString() };
      await writeJson(storePath(root, 'receipts', `${built.manifest.releaseId}.json`), receipt);
      print('BUILD_ONLY', receipt);
    } else {
      await deliverRelease(root, config, built.manifest, built.directory, targets!, print);
    }
  });
  return true;
}
