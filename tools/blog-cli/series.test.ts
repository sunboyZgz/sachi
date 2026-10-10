import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { readSourcePost, scanContent } from '../../src/lib/blog/content';
import { readSourceSeries, scanSeries } from '../../src/lib/blog/series';
import { defaultConfig, type BlogConfig, type Manifest } from '../../src/lib/blog/schema';
import { exists, readJson, writeJson } from '../../src/lib/blog/files';
import { newSeries, editSeries, seriesAssignment, saveSeriesSnapshot, readSeriesSnapshot } from './series';
import { newPost, editMeta } from './writing';
import { cacheCurrent, codeBaseline, readSnapshot, saveSnapshot } from './snapshot';
import { createPlan, validateArticleLinks } from './plan';
import { buildRelease } from './site';
import { run } from './process';
import { storePath } from './config';
import { activateRelease, uploadRelease } from './deploy';
import { backupPlan, restoreGit, saveReleaseToGit, syncContent } from './git';

const temporary: string[] = [];
const cli = fileURLToPath(new URL('./index.ts', import.meta.url));
const tsx = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
const builder = `import fs from 'node:fs/promises';
const posts=JSON.parse(await fs.readFile(process.env.BLOG_CONTENT_ROOT+'/posts.json','utf8'));
const groups=JSON.parse(await fs.readFile(process.env.BLOG_CONTENT_ROOT+'/series.json','utf8'));
await fs.mkdir('out/contents',{recursive:true}); await fs.writeFile('out/index.html','首页'); await fs.writeFile('out/contents/index.html','目录'); await fs.cp('public','out',{recursive:true});
for(const p of posts){await fs.mkdir('out/article/'+p.slug,{recursive:true});await fs.writeFile('out/article/'+p.slug+'/index.html',p.title+' '+p.body);}
for(const s of groups){const chapters=posts.filter(p=>p.series?.id===s.id).sort((a,b)=>a.series.order-b.series.order);if(!chapters.length)continue;await fs.mkdir('out/series/'+s.slug,{recursive:true});await fs.writeFile('out/series/'+s.slug+'/index.html',s.title+' '+(s.description||'')+' '+chapters.map(p=>p.title).join('|'));}
`;

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sachi-series-'))); temporary.push(root);
  await mkdir(path.join(root, 'src')); await mkdir(path.join(root, 'public')); await mkdir(path.join(root, 'content'));
  await writeFile(path.join(root, 'src/build.mjs'), builder);
  for (const [file, value] of Object.entries({ 'package.json': '{"type":"module"}', 'package-lock.json': '{}', 'next.config.ts': 'export default {};', 'tsconfig.json': '{}', 'next-env.d.ts': '' })) await writeFile(path.join(root, file), value);
  const config: BlogConfig = { ...defaultConfig('Asia/Shanghai'), siteAssets: [], buildCommand: ['node', 'src/build.mjs'], deploy: { type: 'local', root: path.join(root, 'server') } };
  await writeJson(path.join(root, 'blog.config.json'), config);
  return { root, config };
}

async function chapter(root: string, config: BlogConfig, id: string, order: number, slug: string) {
  const created = await newPost(root, config, { category: 'learn', title: slug, slug, series: { id, order } });
  return await readSourcePost(root, created.file, config);
}

async function publish(root: string, config: BlogConfig, current: Manifest | null, selected: Awaited<ReturnType<typeof chapter>>[], groups: string[]) {
  const catalogue = (await scanSeries(root)).series.filter((source) => groups.includes(source.series.id));
  const plan = createPlan(current, selected, (await scanContent(root, config)).posts, await codeBaseline(root, config, true), [], new Date(), catalogue);
  for (const source of selected) await saveSnapshot(root, config, source);
  for (const source of catalogue) await saveSeriesSnapshot(root, source);
  const built = await buildRelease(root, config, plan.manifest);
  await uploadRelease(root, config, built.manifest, built.directory); await activateRelease(root, config, built.manifest); await cacheCurrent(root, built.manifest);
  return { ...built, plan };
}

afterEach(async () => { for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('series writing and frozen releases', () => {
  it('suggests orders using published snapshots even when the working chapter is missing', async () => {
    const { root, config } = await fixture();
    const group = await newSeries(root, { title: 'A', category: 'learn', slug: 'a' });
    const one = await chapter(root, config, group.id, 6, 'one');
    await publish(root, config, null, [one], [group.id]);
    await rm(path.join(root, path.dirname(one.sourcePath)), { recursive: true });
    expect(await seriesAssignment(root, config, 'learn', group.id)).toEqual({ id: group.id, order: 7 });
    await expect(seriesAssignment(root, config, 'life', group.id)).rejects.toThrow('同一栏目');
    await expect(editSeries(root, config, group.id, { slug: 'changed' })).rejects.toThrow('不能修改 slug');
  });

  it('updates selected series, retains unselected article and series snapshots, and excludes draft chapters', async () => {
    const { root, config } = await fixture();
    const a = await newSeries(root, { title: 'A published', category: 'learn', slug: 'a' });
    const b = await newSeries(root, { title: 'B published', category: 'learn', slug: 'b' });
    const one = await chapter(root, config, a.id, 1, 'one');
    const other = await chapter(root, config, b.id, 1, 'other');
    const first = await publish(root, config, null, [one, other], [a.id, b.id]);
    await writeFile(path.join(root, one.sourcePath), one.raw.replace('在这里写正文。', 'PRIVATE_WORKING_BODY'));
    await editSeries(root, config, a.id, { title: 'A updated', description: 'new introduction' });
    await editSeries(root, config, b.id, { title: 'PRIVATE_B_TITLE' });
    await chapter(root, config, a.id, 9, 'private-chapter');
    const two = await chapter(root, config, a.id, 3, 'two');
    const second = await publish(root, config, first.manifest, [two], [a.id]);
    expect(second.manifest.entries.find((entry) => entry.id === one.post.id)!.revisionHash).toBe(one.revisionHash);
    expect((await readSnapshot(root, one.revisionHash)).post.body).not.toContain('PRIVATE_WORKING_BODY');
    expect(second.manifest.series!.find((entry) => entry.id === b.id)!.title).toBe('B published');
    const html = await readFile(path.join(second.directory, 'site/series/a/index.html'), 'utf8');
    expect(html).toContain('A updated'); expect(html).toContain('one|two'); expect(html).not.toContain('private-chapter');
    expect(await exists(path.join(second.directory, 'site/article/private-chapter'))).toBe(false);
    const withdrawn = createPlan(second.manifest, [], [], { hash: second.manifest.codeHash, commit: null }, [one.post.id, two.post.id]);
    const removed = await buildRelease(root, config, withdrawn.manifest);
    expect(await exists(path.join(removed.directory, 'site/series/a'))).toBe(false);
    expect(removed.manifest.series!.some((entry) => entry.id === a.id)).toBe(true);
  });

  it('detects candidate conflicts against an unselected old chapter and validates public series references', async () => {
    const { root, config } = await fixture(); const group = await newSeries(root, { title: 'A', category: 'learn', slug: 'a' });
    const one = await chapter(root, config, group.id, 1, 'one'); const two = await chapter(root, config, group.id, 2, 'two');
    const first = await publish(root, config, null, [one, two], [group.id]);
    await editMeta(root, one.sourcePath, { series: { id: group.id, order: 3 } }, false, config);
    await editMeta(root, two.sourcePath, { series: { id: group.id, order: 1 } }, false, config);
    const changed = await readSourcePost(root, two.sourcePath, config);
    expect(() => createPlan(first.manifest, [changed], [], { hash: first.manifest.codeHash, commit: null })).toThrow('序号重复');
    expect(() => validateArticleLinks(first.manifest, [{ id: one.post.id, body: `[目录](series:${group.id}) [目录](/series/a/)` }])).not.toThrow();
    const empty = createPlan(first.manifest, [], [], { hash: first.manifest.codeHash, commit: null }, [one.post.id, two.post.id]);
    expect(() => validateArticleLinks(empty.manifest, [{ id: 'x', body: `[目录](series:${group.id})` }])).toThrow('未公开');
  });

  it('rejects series edits after confirmation and builds solely from frozen metadata', async () => {
    const { root, config } = await fixture(); const group = await newSeries(root, { title: 'Frozen', category: 'learn', slug: 'frozen' });
    const one = await chapter(root, config, group.id, 1, 'one'); const source = await readSourceSeries(root, group.file);
    await saveSnapshot(root, config, one); await saveSeriesSnapshot(root, source);
    const plan = createPlan(null, [one], [], await codeBaseline(root, config, true), [], new Date(), [source]);
    await editSeries(root, config, group.id, { title: 'LATER_PRIVATE_TITLE' });
    await expect(saveSeriesSnapshot(root, source)).rejects.toThrow('确认后');
    expect((await readSeriesSnapshot(root, source.revisionHash)).series.title).toBe('Frozen');
    const built = await buildRelease(root, config, plan.manifest);
    expect(await readFile(path.join(built.directory, 'site/series/frozen/index.html'), 'utf8')).toContain('Frozen');
    expect(await readFile(path.join(built.directory, 'site/series/frozen/index.html'), 'utf8')).not.toContain('LATER_PRIVATE_TITLE');
  });

  it('exposes nested CLI commands, dry-run and metadata-only publishing', async () => {
    const { root, config } = await fixture();
    const invoke = async (args: string[]) => JSON.parse((await run(['node', tsx, cli, ...args, '--root', root, '--json'], { cwd: root })).stdout.trim());
    expect((await invoke(['series', 'new', '--category', 'learn', '--title', 'A', '--dry-run'])).status).toBe('PLANNED');
    expect(await exists(path.join(root, 'content/series'))).toBe(false);
    const created = await invoke(['series', 'new', '--category', 'learn', '--title', 'A', '--slug', 'a', '--yes']);
    const added = await invoke(['new', '--category', 'learn', '--title', 'Chapter', '--slug', 'chapter', '--series', created.data.id]);
    const current = await invoke(['publish', added.data.id, '--yes']); expect(current.status).toBe('DEPLOYED');
    await invoke(['series', 'meta', created.data.id, '--set', 'description=new intro', '--yes']);
    const planned = await invoke(['build', '--series', created.data.id, '--dry-run']);
    expect(planned.data.selected).toEqual([]); expect(planned.data.seriesChanges).toHaveLength(1);
    const updated = await invoke(['publish', '--series', created.data.id, '--yes']); expect(updated.status).toBe('DEPLOYED');
    const manifest = (await readJson(storePath(root, 'current.json')) as { manifest: Manifest }).manifest;
    expect(manifest.entries).toHaveLength(1);
    expect((await readSeriesSnapshot(root, manifest.series![0].revisionHash)).series.description).toBe('new intro');
    expect(config.git).toBeNull(); expect(await exists(path.join(root, '.git'))).toBe(false);
  }, 15000);

  it('backs up and restores series source and frozen metadata using only a temporary Git remote', async () => {
    const { root, config } = await fixture(); const group = await newSeries(root, { title: 'A', category: 'learn', slug: 'a' });
    const one = await chapter(root, config, group.id, 1, 'one'); const built = await publish(root, config, null, [one], [group.id]);
    const remote = path.join(root, 'remote.git'); await run(['git', 'init', '--bare', remote], { cwd: root });
    const gitConfig: BlogConfig = { ...config, git: { remote, branch: 'content-source', visibility: 'private' } };
    await saveReleaseToGit(root, gitConfig, built.manifest, [one.post.id], [group.id]);
    await editSeries(root, config, group.id, { description: 'backed-up working intro' });
    await syncContent(root, gitConfig, await backupPlan(root, gitConfig));
    const destination = path.join(root, 'restored'); await restoreGit(root, gitConfig, destination);
    expect(await readFile(path.join(destination, group.file), 'utf8')).toContain('backed-up working intro');
    expect(await exists(path.join(destination, '.series-snapshots', built.manifest.series![0].revisionHash, 'source.yaml'))).toBe(true);
    expect(await exists(path.join(root, '.git'))).toBe(false);
  });

  it('resumes frozen series metadata, recovers source and rolls back the entire series version', async () => {
    const { root, config } = await fixture();
    const group = await newSeries(root, { title: 'A', category: 'learn', slug: 'a', description: 'intro A' });
    const one = await chapter(root, config, group.id, 1, 'one');
    const first = await publish(root, config, null, [one], [group.id]);
    const invoke = async (args: string[]) => JSON.parse((await run(['node', tsx, cli, ...args, '--root', root, '--json', '--yes'], { cwd: root })).stdout.trim());
    await editSeries(root, config, group.id, { description: 'intro B' });
    const built = await invoke(['build', '--series', group.id]);
    await editSeries(root, config, group.id, { description: 'PRIVATE_LATER_INTRO_C' });
    await invoke(['publish', '--resume', built.data.releaseId]);
    let current = (await readJson(storePath(root, 'current.json')) as { manifest: Manifest }).manifest;
    expect((await readSeriesSnapshot(root, current.series![0].revisionHash)).series.description).toBe('intro B');
    const destination = path.join(root, 'recovered');
    await invoke(['recover', '--destination', destination]);
    expect(await readFile(path.join(destination, group.file), 'utf8')).toContain('intro B');
    await invoke(['rollback', '--to', first.manifest.releaseId]);
    current = (await readJson(storePath(root, 'current.json')) as { manifest: Manifest }).manifest;
    expect((await readSeriesSnapshot(root, current.series![0].revisionHash)).series.description).toBe('intro A');
    expect(await readFile(path.join(root, group.file), 'utf8')).toContain('PRIVATE_LATER_INTRO_C');
  }, 15000);
});
