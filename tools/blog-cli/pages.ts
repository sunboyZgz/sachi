import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';
import { z } from 'zod';
import { dayInTimezone } from '../../src/lib/blog/content';
import { BlogError, atomicWrite, exists, readJson, safeFile, sha256, stableJson, writeJson } from '../../src/lib/blog/files';
import { mappedPost } from '../../src/lib/blog/preview';
import { configSchema, manifestSchema, snapshotSchema, seriesSnapshotSchema, type Asset, type BlogConfig, type Manifest } from '../../src/lib/blog/schema';
import { withBasePath } from '../../src/lib/site-path';
import { cachePath, storePath } from './config';
import { run } from './process';
import { type CodeSnapshot } from './snapshot';
import { verifyPackage } from './site';
import { pagesFiles } from './pages-files';

export function githubTarget(remote: string) {
  let owner: string; let repo: string;
  const scp = /^git@github\.com:([^/]+)\/([^/]+)$/.exec(remote);
  if (scp) [, owner, repo] = scp;
  else {
    let url: URL;
    try { url = new URL(remote); } catch { throw new BlogError('Pages 目标必须是 github.com 的 HTTPS 或 SSH 仓库地址。', 2); }
    if (url.hostname !== 'github.com' || !['https:', 'ssh:'].includes(url.protocol) || url.password || url.search || url.hash || url.port || (url.username && !(url.protocol === 'ssh:' && url.username === 'git'))) throw new BlogError('Pages 仓库地址不能包含凭据、端口、查询参数或非 GitHub 主机。', 2);
    const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) throw new BlogError('Pages 仓库地址需要 owner/repo。', 2);
    [, owner, repo] = match;
  }
  repo = repo.replace(/\.git$/, '');
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(owner!) || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,99}$/.test(repo!) || repo === '.' || repo === '..') throw new BlogError('GitHub 用户名或仓库名无效。', 2);
  const basePath = repo.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '' : `/${repo}`;
  return { remote, owner, repo, repository: `${owner}/${repo}`, basePath, url: `https://${owner.toLowerCase()}.github.io${basePath}/`, branch: 'blog' as const };
}
export type PagesTarget = ReturnType<typeof githubTarget>;

// Git commands never inherit another worktree's index or execute local hooks.
const gitEnv: Partial<NodeJS.ProcessEnv> = { GIT_TERMINAL_PROMPT: '0', GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined, GIT_COMMON_DIR: undefined, GIT_CONFIG: undefined, GIT_CONFIG_PARAMETERS: undefined, GIT_CONFIG_COUNT: '0', GIT_OBJECT_DIRECTORY: undefined, GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined };
export type GitRunner = (cwd: string, args: string[]) => Promise<string>;
export const pagesGit: GitRunner = async (cwd, args) => (await run(['git', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, env: gitEnv, code: 5 })).stdout.trim();

export async function resolvePagesTarget(root: string, config: BlogConfig, override?: string, git: GitRunner = pagesGit) {
  const configured = override ?? config.pages?.remote;
  if (configured) return githubTarget(configured);
  // Do not accidentally adopt an enclosing directory's repository.
  if (!await exists(path.join(root, '.git'))) throw new BlogError('没有根项目 .git；请用 init 配置 pages.remote，或 push --pages-remote <GitHub地址>。不会自动初始化根仓库。', 2, 'INPUT_REQUIRED');
  const remote = await git(root, ['remote', 'get-url', '--push', 'origin']).catch(() => { throw new BlogError('根仓库没有 origin 推送地址；请配置 pages.remote 或 --pages-remote。', 2, 'INPUT_REQUIRED'); });
  return githubTarget(remote);
}

export function pagesWorkflow() {
  return stringify({
    name: 'Build and deploy Sachi Blog',
    on: { push: { branches: ['blog'] }, workflow_dispatch: {} },
    permissions: { contents: 'read' },
    concurrency: { group: 'sachi-github-pages', 'cancel-in-progress': false },
    jobs: {
      build: {
        'if': "github.ref == 'refs/heads/blog'", 'runs-on': 'ubuntu-latest',
        steps: [
          { uses: 'actions/checkout@v6', with: { 'persist-credentials': false } },
          { uses: 'actions/setup-node@v7', with: { 'node-version-file': '.node-version', cache: 'npm' } },
          { name: 'Configure Pages', uses: 'actions/configure-pages@v5' },
          { run: 'npm ci' }, { name: 'Build frozen release', run: 'npm run build' },
          { uses: 'actions/upload-pages-artifact@v4', with: { path: 'out' } },
        ],
      },
      deploy: {
        needs: 'build', 'runs-on': 'ubuntu-latest', permissions: { pages: 'write', 'id-token': 'write' },
        environment: { name: 'github-pages', url: '${{ steps.deployment.outputs.page_url }}' },
        steps: [{ id: 'deployment', uses: 'actions/deploy-pages@v4' }],
      },
    },
  });
}

const bundleSchema = z.object({ schemaVersion: z.literal(1), managedBy: z.literal('sachi-blog-cli'), repository: z.string(), packageHash: z.string().regex(/^[a-f0-9]{64}$/), node: z.string(), basePath: z.string(), manifest: manifestSchema });
export type PagesBundle = z.infer<typeof bundleSchema>;
export async function preparePagesBundle(root: string, packageDirectory: string, manifest: Manifest, target: PagesTarget, directory: string) {
  await verifyPackage(packageDirectory);
  if (stableJson(manifestSchema.parse(await readJson(path.join(packageDirectory, 'release.json')))) !== stableJson(manifest)) throw new BlogError('Pages 候选清单与冻结发布包不一致。', 4);
  const frozen = configSchema.parse(await readJson(path.join(packageDirectory, 'code/blog.config.json')));
  const code = await readJson(path.join(packageDirectory, 'code/code.json')) as CodeSnapshot;
  // Explicit allowlist: never copy root content, .env, docs, Git configuration or stores.
  for (const [file] of code.hashes) {
    if (!(file.startsWith('src/') || file.startsWith('public/') || file.startsWith('tools/blog-cli/') || ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts'].includes(file))) continue;
    const source = await safeFile(path.join(packageDirectory, 'code'), file);
    const destination = path.join(directory, file); await mkdir(path.dirname(destination), { recursive: true }); await cp(source, destination);
  }
  if (!await exists(path.join(directory, 'tools/blog-cli/pages-build.ts'))) throw new BlogError('此旧发布包尚不支持 Pages 构建；请接受新代码基线后重新 build/publish。', 4);
  const assets: Manifest['assets'] = {};
  const posts = [];
  const strippedBase = new URL(frozen.siteUrl ?? target.url).pathname.replace(/\/$/, '');
  const rebase = (url: string) => withBasePath(strippedBase && url.startsWith(`${strippedBase}/`) ? url.slice(strippedBase.length) : url, target.basePath);
  for (const entry of manifest.entries) {
    const snapshot = snapshotSchema.parse(await readJson(path.join(packageDirectory, 'snapshots', entry.revisionHash, 'snapshot.json')));
    if (snapshot.revisionHash !== entry.revisionHash || snapshot.post.id !== entry.id || snapshot.post.fixture) throw new BlogError('Pages 包中的文章快照与发布清单不一致。', 4);
    const mapping: Record<string, Asset> = {};
    for (const [key, asset] of Object.entries(manifest.assets[entry.id] ?? {})) mapping[key] = {
      ...asset, url: rebase(asset.url), ...(asset.poster ? { poster: rebase(asset.poster) } : {}), ...(asset.contour ? { contour: rebase(asset.contour) } : {}),
      ...(asset.srcSet ? { srcSet: asset.srcSet.split(',').map((variant) => { const [url, size] = variant.trim().split(/\s+/); return `${rebase(url)} ${size}`; }).join(', ') } : {}),
    };
    assets[entry.id] = mapping;
    posts.push(mappedPost({ ...snapshot.post, category: entry.category, date: dayInTimezone(entry.publishedAt, frozen.timezone) }, mapping));
  }
  // Reuse immutable, already encoded media, not source attachments or new tool versions.
  if (await exists(path.join(packageDirectory, 'site/media'))) await cp(path.join(packageDirectory, 'site/media'), path.join(directory, 'public/media'), { recursive: true });
  const pagesManifest = { ...manifest, assets };
  await writeJson(path.join(directory, '.blog-input/posts.json'), posts);
  const series = await Promise.all((manifest.series ?? []).map(async (entry) => {
    const snapshot = seriesSnapshotSchema.parse(await readJson(await safeFile(packageDirectory, `series-snapshots/${entry.revisionHash}/snapshot.json`)));
    if (sha256(stableJson(snapshot.series)) !== entry.revisionHash) throw new BlogError('Pages 系列快照摘要不一致。', 4);
    return snapshot.series;
  }));
  await writeJson(path.join(directory, '.blog-input/series.json'), series);
  await writeJson(path.join(directory, '.blog-input/release.json'), pagesManifest);
  await writeJson(path.join(directory, 'public/release-marker.json'), { releaseId: manifest.releaseId });
  await writeJson(path.join(directory, 'blog.config.json'), { ...frozen, siteUrl: target.url, git: null, deploy: null, pages: null, codeRef: null });
  const pkg = await readJson(path.join(directory, 'package.json')) as Record<string, unknown>;
  await writeJson(path.join(directory, 'package.json'), { ...pkg, scripts: { build: 'tsx tools/blog-cli/pages-build.ts' } });
  const bundle: PagesBundle = { schemaVersion: 1, managedBy: 'sachi-blog-cli', repository: target.repository, packageHash: sha256(await readFile(path.join(packageDirectory, 'checksums.json'))), node: code.node, basePath: target.basePath, manifest: pagesManifest };
  await writeJson(path.join(directory, '.blog-pages.json'), bundle);
  await atomicWrite(path.join(directory, '.node-version'), `${code.node.replace(/^v/, '')}\n`);
  await atomicWrite(path.join(directory, '.gitignore'), 'node_modules/\n.next/\nout/\n');
  await atomicWrite(path.join(directory, '.github/workflows/blog-pages.yml'), pagesWorkflow());
  const hashes: Record<string, string> = {};
  for (const file of await pagesFiles(directory)) hashes[file] = sha256(await readFile(await safeFile(directory, file)));
  await writeJson(path.join(directory, '.blog-input/checksums.json'), hashes);
  return bundle;
}

export async function inspectPagesBranch(root: string, target: PagesTarget, git: GitRunner = pagesGit) {
  const result = await git(root, ['ls-remote', target.remote, 'refs/heads/blog']);
  const sha = result.split(/\s+/)[0];
  if (!sha) return null;
  if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new BlogError('远端 blog 分支响应无效。', 5);
  return sha;
}

/** Tests inject a Git runner mapping the validated GitHub URL to a local bare repository. */
export async function pushPagesBranch(root: string, target: PagesTarget, packageDirectory: string, manifest: Manifest, expectedTip: string | null, git: GitRunner = pagesGit) {
  const parent = cachePath(root, 'pages-worktrees'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'push-'));
  await git(directory, ['init', '--initial-branch=blog']);
  await git(directory, ['config', 'user.name', 'Sachi Blog CLI']);
  await git(directory, ['config', 'user.email', 'sachi-blog-cli@users.noreply.github.com']);
  if (await inspectPagesBranch(root, target, git) !== expectedTip) throw new BlogError('确认后远端 blog 分支变化；未覆盖远端，请重新检查。', 4);
  const packageHash = sha256(await readFile(path.join(packageDirectory, 'checksums.json')));
  let sameRelease = false;
  if (expectedTip) {
    await git(directory, ['fetch', '--depth=1', target.remote, 'refs/heads/blog']);
    if (await git(directory, ['rev-parse', 'FETCH_HEAD']) !== expectedTip) throw new BlogError('远端 blog 分支变化，未推送。', 4);
    const previous = await git(directory, ['show', `${expectedTip}:.blog-pages.json`]).then((value) => bundleSchema.safeParse(JSON.parse(value))).catch(() => null);
    if (!previous?.success || previous.data.repository.toLowerCase() !== target.repository.toLowerCase()) throw new BlogError('远端 blog 分支不是本工具管理的发布分支；不会覆盖已有代码。', 4);
    if (previous.data.manifest.releaseId === manifest.releaseId) {
      if (previous.data.packageHash !== packageHash) throw new BlogError('同一发布 ID 对应不同发布包。', 4);
      sameRelease = true;
    }
    if (!sameRelease && previous.data.manifest.releaseId !== manifest.baseReleaseId) throw new BlogError('blog 分支发布基线不匹配；请核实 Pages 状态，不自动合并或强推。', 4);
  }
  await preparePagesBundle(root, packageDirectory, manifest, target, directory);
  // A fresh checkout has no previous files. The new commit still retains its parent.
  await git(directory, ['add', '--force', '--all']);
  const tree = await git(directory, ['write-tree']);
  if (sameRelease) {
    if (tree !== await git(directory, ['rev-parse', `${expectedTip}^{tree}`])) throw new BlogError('远端同一版本的冻结文件已被修改；不会视为相同发布或覆盖它。', 4);
    return { status: 'QUEUED', releaseId: manifest.releaseId, commit: expectedTip!, url: target.url, repository: target.repository, reused: true };
  }
  const commit = await git(directory, ['commit-tree', tree, ...(expectedTip ? ['-p', expectedTip] : []), '-m', `Publish ${manifest.releaseId}`]);
  await git(directory, ['push', target.remote, `${commit}:refs/heads/blog`]);
  return { status: 'QUEUED', releaseId: manifest.releaseId, commit, url: target.url, repository: target.repository, reused: false };
}

export type GithubApi = (endpoint: string, method?: string, data?: Record<string, string>) => Promise<Record<string, unknown>>;
export const githubApi: GithubApi = async (endpoint, method = 'GET', data = {}) => {
  const response = await run(['gh', 'api', '--hostname', 'github.com', endpoint, '--method', method, ...Object.entries(data).flatMap(([key, value]) => ['-f', `${key}=${value}`])], { cwd: process.cwd(), code: 5 });
  return response.stdout.trim() ? JSON.parse(response.stdout) : {};
};
export async function ensurePagesSettings(target: PagesTarget, setup: boolean, api: GithubApi = githubApi) {
  const repo = await api(`repos/${target.repository}`);
  if (repo.private !== false) throw new BlogError('免费 GitHub Pages 方案要求公开仓库；请先核实仓库可见性。工具不会自动修改仓库可见性。', 2);
  let pages: Record<string, unknown> | null;
  try { pages = await api(`repos/${target.repository}/pages`); }
  catch (error) { if (error instanceof Error && /(?:HTTP 404|\(404\))/.test(error.message)) pages = null; else throw error; }
  if (pages?.cname) throw new BlogError('目标仓库已使用自定义域名；本功能采用 GitHub 免费 URL，不会覆盖现有域名设置。', 4);
  if (pages?.build_type === 'workflow') return;
  if (!setup) throw new BlogError('请先在 GitHub Settings → Pages 选择 GitHub Actions，或使用 push --setup-pages 显式启用。', 2, 'INPUT_REQUIRED');
  await api(`repos/${target.repository}/pages`, pages ? 'PUT' : 'POST', { build_type: 'workflow' });
}

export type PagesReceipt = { manifest: Manifest; commit: string; url: string; repository: string; status: 'QUEUED' | 'DEPLOYED'; checkedAt: string };
export async function readPagesState(root: string, target: PagesTarget): Promise<PagesReceipt | null> {
  const file = storePath(root, 'pages', `${sha256(target.repository.toLowerCase())}.json`);
  if (!await exists(file)) return null;
  const value = await readJson(file) as PagesReceipt;
  manifestSchema.parse(value.manifest);
  if (value.repository.toLowerCase() !== target.repository.toLowerCase() || value.url !== target.url) throw new BlogError('Pages 发布记录与目标仓库不一致。', 4);
  return value;
}
export async function savePagesState(root: string, target: PagesTarget, value: PagesReceipt) {
  await writeJson(storePath(root, 'pages', `${sha256(target.repository.toLowerCase())}.json`), value);
}
export async function pagesStatus(root: string, config: BlogConfig, options: { persist?: boolean; requireDeployed?: boolean } = {}) {
  const target = await resolvePagesTarget(root, config);
  const state = await readPagesState(root, target);
  if (!state) return { target, status: 'UNVERIFIED', manifest: null };
  const response = await fetch(new URL(`release-marker.json?check=${Date.now()}`, target.url), { signal: AbortSignal.timeout(15_000), cache: 'no-store', redirect: 'error' }).catch(() => null);
  const marker = response?.ok ? await response.json().catch(() => null) as { releaseId?: string } | null : null;
  const deployed = marker?.releaseId === state.manifest.releaseId;
  if (!deployed && options.requireDeployed) throw new BlogError('GitHub Pages 最新推送尚未核实上线；请等待 Actions 完成，再运行 status --remote。不会把排队中的清单当作已发布基线。', 4, 'PAGES_PENDING');
  if (deployed && options.persist) await savePagesState(root, target, { ...state, status: 'DEPLOYED', checkedAt: new Date().toISOString() });
  return { target, status: deployed ? 'DEPLOYED' : 'QUEUED_OR_UNKNOWN', manifest: deployed ? state.manifest : null, pushedReleaseId: state.manifest.releaseId, commit: state.commit };
}
