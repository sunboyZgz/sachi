/** Disposable four-page blog; no working articles, Git, or live deployment are used. */
import { cp, mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite, writeJson } from '../../src/lib/blog/files';
import { readSourcePost } from '../../src/lib/blog/content';
import { defaultConfig } from '../../src/lib/blog/schema';
import { createPlan } from '../blog-cli/plan';
import { codeBaseline, saveSnapshot } from '../blog-cli/snapshot';
import { buildRelease } from '../blog-cli/site';
import { newPost } from '../blog-cli/writing';

const project = fileURLToPath(new URL('../../', import.meta.url));
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sachi-pagination-')));
for (const file of ['src', 'tools/blog-cli', 'bin', 'public/assets', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'next-env.d.ts']) {
  await cp(path.join(project, file), path.join(root, file), { recursive: true });
}
await symlink(path.join(project, 'node_modules'), path.join(root, 'node_modules'), 'dir');
const config = defaultConfig('Asia/Shanghai');
config.siteUrl = 'https://pagination.invalid/sachi/';
await writeJson(path.join(root, 'blog.config.json'), config);
const posts = [];
for (let index = 1; index <= 10; index += 1) {
  const created = await newPost(root, config, { category: 'play', title: `分页验收手记 ${String(index).padStart(2, '0')}`, slug: `pagination-${index}`, now: new Date(`2026-10-${String(index).padStart(2, '0')}T00:00:00Z`) });
  posts.push(await readSourcePost(root, created.file, config));
}
const draft = await newPost(root, config, { category: 'learn', title: '不进入正式构建的草稿', slug: 'private-pagination-draft' });
await mkdir(path.join(root, '.blog'), { recursive: true });
await atomicWrite(path.join(root, '.blog', 'pagination-fixture.json'), JSON.stringify({ root, ownedBy: 'pagination-fixture' }));
console.log(JSON.stringify({ root, pages: 4, draft: draft.file }));
if (process.argv.includes('--build')) {
  const baseline = await codeBaseline(root, config, true);
  for (const source of posts) await saveSnapshot(root, config, source);
  const plan = createPlan(null, posts, posts, baseline);
  const built = await buildRelease(root, config, plan.manifest, { echo: true });
  console.log(JSON.stringify({ root, site: path.join(built.directory, 'site'), basePath: '/sachi', releaseId: built.manifest.releaseId }));
}
