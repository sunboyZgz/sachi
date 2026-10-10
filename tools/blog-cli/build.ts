import path from 'node:path';
import { BlogError } from '../../src/lib/blog/files';
import { scanContent } from '../../src/lib/blog/content';
import { previewPosts } from '../../src/lib/blog/preview';
import { cachedManifest } from './state';
import { cachePath, loadConfig } from './config';
import { createPlan } from './plan';
import { run } from './process';
import { codeBaseline } from './snapshot';
import { buildRelease, copyExport } from './site';
import { withLock } from '../../src/lib/blog/files';

async function build() {
  const root = process.cwd(); const config = await loadConfig(root);
  if (process.argv.includes('--fixtures')) {
    const { posts, issues } = await scanContent(root, config, 'tests/fixtures/content');
    if (issues.length) throw new BlogError(issues.map((issue) => `${issue.file}: ${issue.message}`).join('\n'));
    await previewPosts(root, posts);
    await run(config.buildCommand, { cwd: root, echo: true, code: 6, timeout: 600_000, env: { NODE_ENV: 'production', BLOG_CONTENT_MODE: 'working', BLOG_RELEASE_MANIFEST: undefined, BLOG_CONTENT_ROOT: undefined, BLOG_ASSET_PREFIX: undefined, NEXT_PUBLIC_BLOG_ASSET_PREFIX: undefined, NEXT_PUBLIC_BLOG_BASE_PATH: undefined, BLOG_TIMEZONE: config.timezone, INCLUDE_FIXTURES: 'true', NEXT_TELEMETRY_DISABLED: '1' } });
    return;
  }
  await withLock(cachePath(root, 'publish.lock'), async () => {
    const current = (await cachedManifest(root)).manifest;
    const code = await codeBaseline(root, config, true);
    const plan = createPlan(current, [], [], code);
    const built = await buildRelease(root, config, plan.manifest, { echo: true });
    const output = await copyExport(built.directory, root);
    console.log(`静态导出：${path.resolve(output)}。只包含当前发布快照；无发布记录时为空站，不采用草稿。旧 out 已保留在 .blog/export-backups/。`);
  });
}
build().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = error instanceof BlogError ? error.code : 2; });
