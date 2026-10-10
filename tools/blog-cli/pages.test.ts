import path from 'node:path';
import os from 'node:os';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { readSourcePost, scanContent } from '../../src/lib/blog/content';
import { atomicWrite, BlogError, exists, readJson, walk, writeJson } from '../../src/lib/blog/files';
import { defaultConfig, type BlogConfig } from '../../src/lib/blog/schema';
import { withBasePath } from '../../src/lib/site-path';
import { newPost } from './writing';
import { codeBaseline, saveSnapshot } from './snapshot';
import { createPlan } from './plan';
import { buildRelease } from './site';
import { buildPages } from './pages-build';
import * as pages from './pages';
import { ensurePagesSettings, githubTarget, inspectPagesBranch, pagesGit, pagesStatus, pagesWorkflow, preparePagesBundle, pushPagesBranch, resolvePagesTarget, savePagesState, type GitRunner } from './pages';
import { deliverRelease, releaseCurrent } from './delivery';
import { remoteCurrent } from './deploy';
import { parseCli } from './arguments';
import { main } from './index';

const temporary: string[] = [];
async function fixture() {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sachi-pages-test-'))); temporary.push(parent);
  const root = path.join(parent, 'project'); await mkdir(path.join(root, 'src'), { recursive: true }); await mkdir(path.join(root, 'public'));
  for (const [file, value] of Object.entries({ 'package.json': '{"type":"module"}', 'package-lock.json': '{}', 'next.config.ts': 'export default {};', 'tsconfig.json': '{}', 'next-env.d.ts': '', 'tools/blog-cli/pages-build.ts': '// Portable renderer fixture' })) await atomicWrite(path.join(root, file), value);
  await atomicWrite(path.join(root, 'src/build.mjs'), `import fs from 'node:fs/promises';
const posts=JSON.parse(await fs.readFile(process.env.BLOG_CONTENT_ROOT+'/posts.json','utf8'));
const base=process.env.NEXT_PUBLIC_BLOG_BASE_PATH || '';
await fs.mkdir('out/contents',{recursive:true}); await fs.cp('public','out',{recursive:true});
await fs.mkdir('out/_next/static',{recursive:true}); await fs.writeFile('out/_next/static/demo.js','frozen');
await fs.writeFile('out/index.html','<a href="'+base+'/contents/">目录</a>');
await fs.writeFile('out/contents/index.html',posts.map(p=>p.title).join(' | '));
for(const p of posts){const dir='out/article/'+p.slug;await fs.mkdir(dir,{recursive:true});await fs.writeFile(dir+'/index.html',p.title+p.body);}`);
  const config = { ...defaultConfig('Asia/Shanghai'), siteAssets: [], buildCommand: ['node', 'src/build.mjs'], deploy: { type: 'local' as const, root: path.join(parent, 'server') } };
  await writeJson(path.join(root, 'blog.config.json'), config);
  const a = await newPost(root, config, { title: '公开 A', category: '生活旁白', slug: 'public-a' });
  const draft = await newPost(root, config, { title: '私密草稿', category: '蘸豆！！', slug: 'draft' });
  await atomicWrite(path.join(root, draft.file), (await readFile(path.join(root, draft.file), 'utf8')).replace('在这里写正文。', 'PRIVATE_DRAFT_DO_NOT_PUBLISH'));
  const source = await readSourcePost(root, a.file, config);
  await saveSnapshot(root, config, source);
  const plan = createPlan(null, [source], (await scanContent(root, config)).posts, await codeBaseline(root, config, true));
  const built = await buildRelease(root, config, plan.manifest);
  const target = githubTarget('https://github.com/owner/sachi.git');
  const remote = path.join(parent, 'repo.git'); await mkdir(remote); await pagesGit(remote, ['init', '--bare', '--initial-branch=main']);
  const git: GitRunner = (cwd, args) => pagesGit(cwd, args.map((argument) => argument === target.remote ? remote : argument));
  return { root, parent, config, built, target, remote, git, a };
}
afterEach(async () => { vi.unstubAllGlobals(); vi.restoreAllMocks(); for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true }); });

describe('GitHub target discovery and path rules', () => {
  it.each(['https://github.com/owner/sachi.git', 'git@github.com:owner/sachi.git', 'ssh://git@github.com/owner/sachi.git'])('accepts credential-free GitHub addresses: %s', (remote) => {
    expect(githubTarget(remote)).toMatchObject({ repository: 'owner/sachi', basePath: '/sachi', url: 'https://owner.github.io/sachi/', branch: 'blog' });
  });
  it('recognizes a user site and prefixes native URLs once', () => {
    expect(githubTarget('git@github.com:Owner/owner.github.io.git').url).toBe('https://owner.github.io/');
    expect(withBasePath('/article/a/', '/sachi')).toBe('/sachi/article/a/');
    for (const url of ['/sachi/article/a/', '#标题', './assets/a.png', 'https://other.org/', '//other.org/a']) expect(withBasePath(url, '/sachi')).toBe(url);
  });
  it.each(['https://TOKEN@github.com/owner/repo.git', 'https://github.com:444/owner/repo', 'git@evil.org:owner/repo', 'https://github.com/owner/repo?token=secret', 'https://github.com/owner/repo#secret', '/tmp/repo.git', 'https://github.com/owner/../repo', 'https://github.com/owner/%2F'])('rejects unsafe or non-GitHub targets: %s', (remote) => {
    expect(() => githubTarget(remote)).toThrow();
  });
  it('uses override, saved config, then root origin push URL, without initializing Git', async () => {
    const { root, config, target } = await fixture();
    await expect(resolvePagesTarget(root, config)).rejects.toMatchObject({ status: 'INPUT_REQUIRED' });
    expect(await exists(path.join(root, '.git'))).toBe(false);
    expect((await resolvePagesTarget(root, { ...config, pages: { branch: 'blog', remote: target.remote } })).repository).toBe('owner/sachi');
    await atomicWrite(path.join(root, '.git'), 'gitdir: test-worktree');
    const git = vi.fn<GitRunner>().mockResolvedValue('git@github.com:owner/other.git');
    expect((await resolvePagesTarget(root, config, undefined, git)).repository).toBe('owner/other');
    expect(git).toHaveBeenCalledWith(root, ['remote', 'get-url', '--push', 'origin']);
    expect((await resolvePagesTarget(root, { ...config, pages: { branch: 'blog', remote: target.remote } }, 'git@github.com:owner/override.git', git)).repository).toBe('owner/override');
    expect(git).toHaveBeenCalledTimes(1);
  });
  it('keeps explicit command flags and performs no writes when a root repository is missing', async () => {
    expect(parseCli(['push', 'r-abcdefgh', '--pages-remote', 'git@github.com:owner/sachi.git', '--setup-pages', '--dry-run']).options).toMatchObject({ 'pages-remote': 'git@github.com:owner/sachi.git', 'setup-pages': true, 'dry-run': true });
    const { root, built } = await fixture(); const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(main(['push', built.manifest.releaseId, '--root', root, '--json', '--dry-run'])).rejects.toMatchObject({ status: 'INPUT_REQUIRED' });
    expect(await exists(path.join(root, '.git'))).toBe(false); expect(logs).not.toHaveBeenCalled();
  });
});

describe('frozen blog branch without working drafts or root Git mutations', () => {
  it('generates a portable release, pins Node, and builds only frozen selected content', async () => {
    const { root, parent, config, built, target, a } = await fixture();
    await atomicWrite(path.join(root, '.env'), 'PRIVATE_ENV_SECRET');
    await atomicWrite(path.join(root, a.file), (await readFile(path.join(root, a.file), 'utf8')).replace('在这里写正文。', 'NEW_WORKING_REVISION_MUST_NOT_LEAK'));
    const directory = path.join(parent, 'bundle'); await mkdir(directory);
    await preparePagesBundle(root, built.directory, built.manifest, target, directory);
    expect(await exists(path.join(directory, 'content'))).toBe(false); expect(await exists(path.join(directory, '.env'))).toBe(false);
    expect(await readJson(path.join(directory, 'blog.config.json'))).toMatchObject({ git: null, deploy: null, pages: null, siteUrl: target.url });
    const posts = await readFile(path.join(directory, '.blog-input/posts.json'), 'utf8');
    expect(posts).toContain('公开 A'); expect(posts).not.toContain('PRIVATE_DRAFT'); expect(posts).not.toContain('NEW_WORKING_REVISION');
    const output = await buildPages(directory, false);
    expect(await readFile(path.join(output, 'index.html'), 'utf8')).toContain('/sachi/contents/');
    expect(await exists(path.join(output, 'versions', built.manifest.releaseId, '_next/static/demo.js'))).toBe(true);
    expect(await exists(path.join(output, 'article/draft'))).toBe(false);
    expect(config.deploy?.type).toBe('local');
    await atomicWrite(path.join(directory, '.blog-input/posts.json'), '[]');
    await expect(buildPages(directory, false)).rejects.toThrow('冻结文件发生变化');
  });
  it('pushes and reuses a managed release while preserving main and the root index', async () => {
    const { root, parent, built, target, remote, git } = await fixture();
    const developer = path.join(parent, 'developer'); await mkdir(developer);
    await pagesGit(developer, ['init', '--initial-branch=main']); await pagesGit(developer, ['config', 'user.name', 'Test']); await pagesGit(developer, ['config', 'user.email', 'test@example.org']);
    await atomicWrite(path.join(developer, 'development.txt'), 'main stays untouched'); await pagesGit(developer, ['add', '.']); await pagesGit(developer, ['commit', '-m', 'Development']); await pagesGit(developer, ['push', remote, 'HEAD:main']);
    const mainTip = await pagesGit(remote, ['rev-parse', 'main']);
    await pagesGit(root, ['init', '--initial-branch=main']); await pagesGit(root, ['config', 'user.name', 'Local Developer']); await pagesGit(root, ['config', 'user.email', 'local@example.org']);
    await pagesGit(root, ['commit', '--allow-empty', '-m', 'Local main']);
    await atomicWrite(path.join(root, 'staged-user-file.txt'), 'Preserve my staged content'); await pagesGit(root, ['add', 'staged-user-file.txt']);
    const indexBefore = await pagesGit(root, ['ls-files', '--stage']);
    const headBefore = await pagesGit(root, ['rev-parse', 'HEAD']);
    const pushed = await pushPagesBranch(root, target, built.directory, built.manifest, null, git);
    expect(pushed.status).toBe('QUEUED'); expect(await pagesGit(remote, ['rev-parse', 'main'])).toBe(mainTip);
    expect(await pagesGit(root, ['ls-files', '--stage'])).toBe(indexBefore);
    expect(await pagesGit(root, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(await pagesGit(root, ['branch', '--show-current'])).toBe('main');
    const names = (await pagesGit(remote, ['ls-tree', '-r', '--name-only', 'blog'])).split('\n');
    expect(names).toContain('.github/workflows/blog-pages.yml'); expect(names).toContain('.blog-input/posts.json');
    expect(names.some((name) => /^(?:content|docs-site|\.blog-store|\.env)/.test(name))).toBe(false);
    const reused = await pushPagesBranch(root, target, built.directory, built.manifest, pushed.commit, git);
    expect(reused).toMatchObject({ reused: true, commit: pushed.commit });
  });
  it('appends normal commits for the next release without force pushing', async () => {
    const { root, config, built, target, remote, git, a } = await fixture();
    const calls: string[][] = [];
    const loggedGit: GitRunner = (cwd, args) => { calls.push(args); return git(cwd, args); };
    const first = await pushPagesBranch(root, target, built.directory, built.manifest, null, loggedGit);
    await atomicWrite(path.join(root, a.file), (await readFile(path.join(root, a.file), 'utf8')).replace('在这里写正文。', 'A 的第二个公开修订'));
    const source = await readSourcePost(root, a.file, config); await saveSnapshot(root, config, source);
    const plan = createPlan(built.manifest, [source], [source], await codeBaseline(root, config, true));
    const next = await buildRelease(root, config, plan.manifest);
    const second = await pushPagesBranch(root, target, next.directory, next.manifest, first.commit, loggedGit);
    expect(await pagesGit(remote, ['rev-parse', 'blog^'])).toBe(first.commit);
    expect(second.commit).not.toBe(first.commit);
    expect(await pagesGit(remote, ['show', 'blog:.blog-input/posts.json'])).toContain('A 的第二个公开修订');
    expect(calls.filter((args) => args[0] === 'push').every((args) => !args.some((argument) => argument.startsWith('--force') || argument.startsWith('+')))).toBe(true);
    expect(await exists(path.join(root, '.git'))).toBe(false);
  });
  it('refuses changed remote tips, unmanaged blog branches and stale release baselines', async () => {
    const { root, built, target, git } = await fixture();
    const pushed = await pushPagesBranch(root, target, built.directory, built.manifest, null, git);
    await expect(pushPagesBranch(root, target, built.directory, built.manifest, null, git)).rejects.toThrow('远端 blog 分支变化');
    const invalid = { ...built.manifest, releaseId: 'r-other-version', baseReleaseId: null };
    await expect(pushPagesBranch(root, target, built.directory, invalid, pushed.commit, git)).rejects.toThrow('基线不匹配');
    const unmanaged: GitRunner = async (cwd, args) => args[0] === 'show' ? '{}' : git(cwd, args);
    await expect(pushPagesBranch(root, target, built.directory, built.manifest, pushed.commit, unmanaged)).rejects.toThrow('不是本工具管理');
    expect(await inspectPagesBranch(root, target, git)).toBe(pushed.commit);
  });
  it('keeps workflow jobs dependent, restricts blog, and uses minimal deploy permissions', () => {
    const workflow = parse(pagesWorkflow());
    expect(workflow.on.push.branches).toEqual(['blog']); expect(workflow.jobs.build.if).toContain('refs/heads/blog');
    expect(workflow.jobs.deploy.needs).toBe('build'); expect(workflow.jobs.deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
    expect(workflow.jobs.deploy.environment.name).toBe('github-pages');
    expect(workflow.jobs.build.steps.find((step: { run?: string }) => step.run === 'npm run build')).toBeDefined();
  });
});

describe('Pages settings, receipts and both delivery hooks without live GitHub', () => {
  it('requires explicit setup and protects private repositories and custom domains', async () => {
    const target = githubTarget('git@github.com:owner/sachi.git');
    const api = vi.fn<pages.GithubApi>().mockImplementation(async (endpoint) => {
      if (endpoint.endsWith('/pages')) throw new BlogError('HTTP 404'); return { private: false };
    });
    await expect(ensurePagesSettings(target, false, api)).rejects.toMatchObject({ status: 'INPUT_REQUIRED' });
    expect(api.mock.calls.every((call) => !call[1] || call[1] === 'GET')).toBe(true);
    api.mockImplementation(async (endpoint, method) => method === 'POST' ? {} : endpoint.endsWith('/pages') ? Promise.reject(new BlogError('HTTP 404')) : { private: false });
    await ensurePagesSettings(target, true, api); expect(api).toHaveBeenCalledWith('repos/owner/sachi/pages', 'POST', { build_type: 'workflow' });
    await expect(ensurePagesSettings(target, true, async () => ({ private: true }))).rejects.toThrow('公开仓库');
    await expect(ensurePagesSettings(target, true, async (endpoint) => endpoint.endsWith('/pages') ? { cname: 'existing.org' } : { private: false })).rejects.toThrow('不会覆盖');
  });
  it('never promotes a queued release until the public marker confirms it', async () => {
    const { root, built, config, target } = await fixture();
    const pagesConfig = { ...config, deploy: null, pages: { remote: target.remote, branch: 'blog' as const } };
    await savePagesState(root, target, { manifest: built.manifest, commit: 'a'.repeat(40), repository: target.repository, url: target.url, status: 'QUEUED', checkedAt: new Date().toISOString() });
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ releaseId: 'r-older-version' }), { status: 200 })); vi.stubGlobal('fetch', fetchMock);
    expect((await pagesStatus(root, pagesConfig)).manifest).toBeNull();
    await expect(releaseCurrent(root, pagesConfig)).rejects.toMatchObject({ status: 'PAGES_PENDING' });
    expect(await exists(path.join(root, '.blog-store/current.json'))).toBe(false);
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ releaseId: built.manifest.releaseId }), { status: 200 }));
    expect((await pagesStatus(root, pagesConfig, { persist: true })).status).toBe('DEPLOYED');
    expect((await releaseCurrent(root, pagesConfig, true))?.releaseId).toBe(built.manifest.releaseId);
    expect(await exists(path.join(root, '.blog-store/current.json'))).toBe(true);
  });
  it('attempts the second hook after server failure and records partial results', async () => {
    const { root, parent, config, built, target } = await fixture();
    const blocked = path.join(parent, 'not-a-directory'); await atomicWrite(blocked, 'do not change');
    const both: BlogConfig = { ...config, pages: { remote: target.remote, branch: 'blog' }, deploy: { type: 'local', root: blocked } };
    vi.spyOn(pages, 'ensurePagesSettings').mockResolvedValue();
    const push = vi.spyOn(pages, 'pushPagesBranch').mockResolvedValue({ status: 'QUEUED', releaseId: built.manifest.releaseId, commit: 'b'.repeat(40), url: target.url, repository: target.repository, reused: false });
    const print = vi.fn();
    await expect(deliverRelease(root, both, built.manifest, built.directory, { server: 'local', pages: { target, tip: null }, setupPages: false }, print)).rejects.toMatchObject({ status: 'PARTIAL_OR_FAILED', details: { hooks: { pages: { status: 'QUEUED' } } } });
    expect(push).toHaveBeenCalled(); expect(print).not.toHaveBeenCalled();
    expect(await exists(path.join(root, '.blog-store/current.json'))).toBe(false);
  });
  it('preserves a successful server deployment when the Pages hook fails', async () => {
    const { root, config, built, target } = await fixture();
    vi.spyOn(pages, 'ensurePagesSettings').mockRejectedValue(new BlogError('mock auth failure', 5));
    const print = vi.fn();
    await expect(deliverRelease(root, { ...config, pages: { remote: target.remote, branch: 'blog' } }, built.manifest, built.directory, { server: 'local', pages: { target, tip: null }, setupPages: false }, print)).rejects.toMatchObject({ status: 'PARTIAL_OR_FAILED', details: { hooks: { server: { status: 'DEPLOYED' } } } });
    expect((await remoteCurrent(root, config))?.releaseId).toBe(built.manifest.releaseId);
    expect(print).not.toHaveBeenCalled();
    expect((await walk(path.join(root, '.blog-store/receipts'))).length).toBe(1);
  });
  it('emits one parseable JSON error with both hook results and the exact retry target', async () => {
    const { root, parent, built, target } = await fixture();
    const commands = path.join(parent, 'mock-commands'); await mkdir(commands);
    await atomicWrite(path.join(commands, 'git'), '#!/usr/bin/env node\nprocess.exit(0);\n');
    await atomicWrite(path.join(commands, 'gh'), '#!/usr/bin/env node\nprocess.stderr.write("MOCK_AUTH_FAILURE_NO_NETWORK"); process.exit(1);\n');
    for (const command of ['git', 'gh']) await chmod(path.join(commands, command), 0o755);
    const cli = fileURLToPath(new URL('./index.ts', import.meta.url));
    const tsx = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
    const result = await execa(process.execPath, [tsx, cli, 'push', built.manifest.releaseId, '--root', root, '--pages-remote', target.remote, '--yes', '--json'], { cwd: root, env: { PATH: `${commands}${path.delimiter}${process.env.PATH}` }, reject: false });
    expect(result.exitCode).toBe(8);
    const output = JSON.parse(result.stdout);
    expect(output.status).toBe('PARTIAL_OR_FAILED'); expect(output.details.hooks.server.status).toBe('DEPLOYED');
    expect(output.details.hooks.pages.reason).toContain('MOCK_AUTH_FAILURE_NO_NETWORK');
    expect(output.error).toContain(`--pages-remote ${target.remote}`);
    expect(await exists(path.join(root, '.git'))).toBe(false);
  });
});
