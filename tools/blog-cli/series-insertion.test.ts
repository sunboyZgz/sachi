import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'yaml';
import { randomUUID } from 'node:crypto';
import { atomicWrite, exists, sha256, writeJson } from '../../src/lib/blog/files';

import { legacyConfig as defaultConfig } from '../../tests/helpers/legacy-config';
import { newSeries } from './series';
import { newPost } from './writing';
import { prepareSeriesInsertion, commitSeriesInsertion } from './series-insertion';
import { prepareWritingTransaction, recoverWritingTransactions, assertNoPendingWrites } from './writing-transactions';
import { run } from './process';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(orders: number[] = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sachi-insertion-')); temporary.push(root); await mkdir(path.join(root, 'content'));
  const config = defaultConfig('Asia/Shanghai');
  const group = await newSeries(root, { title: '我学会了', category: 'play' });
  const chapters = [];
  for (const order of orders) chapters.push(await newPost(root, config, { category: 'play', title: `章节 ${order}`, series: { id: group.id, order } }));
  const article = await newPost(root, config, { category: 'play', title: '朝思暮想的玩具' });
  return { root, config, group, chapters, article };
}
async function metadata(root: string, file: string) { return parse((await readFile(path.join(root, file), 'utf8')).split('---')[1]); }
const cli = path.resolve('tools/blog-cli/index.ts'); const tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
describe('series chapter insertion', () => {
  it.each([[1, 2, 3], [1, 10, 20], []])('inserts into %j and shifts every later chapter even through gaps', async (...orders) => {
    const f = await fixture(orders);
    const plan = await prepareSeriesInsertion(f.root, f.config, f.article.id, f.group.id, 2);
    const result = await commitSeriesInsertion(f.root, f.config, plan);
    expect(result.order).toBe(2);
    expect((await metadata(f.root, f.article.file)).series).toEqual({ id: f.group.id, order: 2 });
    for (let index = 0; index < orders.length; index += 1) expect((await metadata(f.root, f.chapters[index].file)).series.order).toBe(orders[index] >= 2 ? orders[index] + 1 : orders[index]);
    await expect(prepareSeriesInsertion(f.root, f.config, f.article.id, f.group.id, 3)).rejects.toThrow('已经属于');
  });
  it('preserves BOM, CRLF, YAML comments, identity and body including trailing spaces', async () => {
    const f = await fixture([2]); const file = path.join(f.root, f.chapters[0].file);
    const original = '\uFEFF' + (await readFile(file, 'utf8')).replace('order: 2', 'order: 2 # 排版章节').replaceAll('\n', '\r\n') + '末尾  \r\n';
    await writeFile(file, original);
    await commitSeriesInsertion(f.root, f.config, await prepareSeriesInsertion(f.root, f.config, f.article.id, f.group.id, 2));
    const updated = await readFile(file, 'utf8');
    expect(updated.startsWith('\uFEFF---\r\n')).toBe(true); expect(updated).toContain('order: 3 # 排版章节');
    expect(updated.split('---')[2]).toBe(original.split('---')[2]); expect((await metadata(f.root, f.chapters[0].file)).id).toBe(f.chapters[0].id);
  });
  it('rejects a different existing series, wrong category, non-ID selectors and unsafe orders', async () => {
    const f = await fixture([2]); const other = await newSeries(f.root, { title: '另一个系列', category: 'life' });
    await expect(prepareSeriesInsertion(f.root, f.config, f.chapters[0].id, other.id, 1)).rejects.toThrow('已经属于');
    await expect(prepareSeriesInsertion(f.root, f.config, f.article.id, other.id, 1)).rejects.toThrow('同一栏目');
    await expect(prepareSeriesInsertion(f.root, f.config, '朝思暮想的玩具', f.group.id, 1)).rejects.toThrow();
    for (const order of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) await expect(prepareSeriesInsertion(f.root, f.config, f.article.id, f.group.id, order)).rejects.toThrow();
    const max = await fixture([Number.MAX_SAFE_INTEGER]);
    await expect(prepareSeriesInsertion(max.root, max.config, max.article.id, max.group.id, 1)).rejects.toThrow();
  });
  it('rejects changes after confirmation before creating the recovery record', async () => {
    const f = await fixture([2]); const plan = await prepareSeriesInsertion(f.root, f.config, f.article.id, f.group.id, 2);
    await writeFile(path.join(f.root, f.chapters[0].file), (await readFile(path.join(f.root, f.chapters[0].file), 'utf8')) + '\n新修改');
    await expect(commitSeriesInsertion(f.root, f.config, plan)).rejects.toThrow('确认后');
    expect(await exists(path.join(f.root, '.blog-store/writing-transactions'))).toBe(false);
    expect((await metadata(f.root, f.article.file)).series).toBeUndefined();
  });
  it('does not overlap a publication freeze held by another process', async () => {
    const f = await fixture([2]); await writeJson(path.join(f.root, '.blog/publish.lock'), { pid: process.pid });
    await expect(run(['node', tsx, cli, 'series', 'add', f.article.id, '--series', f.group.id, '--order', '2', '--yes', '--json', '--root', f.root], { cwd: f.root })).rejects.toThrow('持有锁');
    expect((await metadata(f.root, f.article.file)).series).toBeUndefined();
    expect(await exists(path.join(f.root, '.blog-store/writing-transactions'))).toBe(false);
  });
  it('rolls every replacement back if a later write fails', async () => {
    const f = await fixture([2, 3]); const plan = await prepareSeriesInsertion(f.root, f.config, f.article.id, f.group.id, 2);
    let writes = 0;
    await expect(commitSeriesInsertion(f.root, f.config, plan, async (file, bytes) => { if (++writes === 2) throw new Error('模拟磁盘写入失败'); await atomicWrite(file, bytes); })).rejects.toThrow('模拟磁盘');
    for (const change of plan.files) expect(await readFile(path.join(f.root, change.file), 'utf8')).toBe(change.before);
    await expect(assertNoPendingWrites(f.root)).resolves.toBeUndefined();
  });
  it('recovers an interrupted write, blocks mutations/builds and permits read-only queries', async () => {
    const f = await fixture([2, 3]); const plan = await prepareSeriesInsertion(f.root, f.config, f.article.id, f.group.id, 2);
    const journal = await prepareWritingTransaction(f.root, plan.files);
    await atomicWrite(path.join(f.root, plan.files[0].file), plan.files[0].after);
    await expect(newPost(f.root, f.config, { category: 'play', title: 'blocked' })).rejects.toThrow('尚未恢复');
    await expect(run(['node', tsx, cli, 'build', f.article.id, '--dry-run', '--json', '--root', f.root], { cwd: f.root })).rejects.toThrow('WRITING_RECOVERY_REQUIRED');
    const query = await run(['node', tsx, cli, 'search', '朝思暮想', '--json', '--root', f.root], { cwd: f.root }); expect(JSON.parse(query.stdout).data.matches).toHaveLength(1);
    await expect(run(['node', tsx, cli, 'series', 'add', f.article.id, '--series', f.group.id, '--order', '2', '--dry-run', '--json', '--root', f.root], { cwd: f.root })).rejects.toThrow('WRITING_RECOVERY_REQUIRED');
    const added = JSON.parse((await run(['node', tsx, cli, 'series', 'add', f.article.id, '--series', f.group.id, '--order', '2', '--yes', '--json', '--root', f.root], { cwd: f.root })).stdout);
    expect(added.data.recovered).toEqual([journal.id]); expect(added.data.changes).toHaveLength(3);
  });
  it('refuses recovery when an editor changed any affected file, retaining backups', async () => {
    const f = await fixture([2]); const plan = await prepareSeriesInsertion(f.root, f.config, f.article.id, f.group.id, 2);
    const journal = await prepareWritingTransaction(f.root, plan.files); await atomicWrite(path.join(f.root, plan.files[0].file), plan.files[0].after);
    await writeFile(path.join(f.root, f.article.file), plan.files.at(-1)!.before + '\n人工编辑');
    await expect(recoverWritingTransactions(f.root)).rejects.toThrow('额外修改');
    expect(await readFile(path.join(f.root, plan.files[0].file), 'utf8')).toBe(plan.files[0].after);
    expect(await exists(path.join(f.root, `.blog-store/writing-transactions/${journal.id}/journal.json`))).toBe(true);
  });
  it('refuses to shift a published chapter whose local source is missing', async () => {
    const f = await fixture(); const missing = randomUUID();
    await writeJson(path.join(f.root, '.blog-store/current.json'), { manifest: { schemaVersion: 1, releaseId: `r-${randomUUID()}`, baseReleaseId: null, createdAt: new Date().toISOString(), codeHash: sha256('code'), codeCommit: null, withdrawn: [], retired: [], assets: {}, series: [{ ...f.group, revisionHash: sha256('series'), publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], entries: [{ id: missing, slug: missing, title: '缺失章节', category: 'play', sourcePath: 'content/闲暇娱乐/2026-01-01/index.md', revisionHash: sha256('snapshot'), publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), gitCommit: null, series: { id: f.group.id, order: 10 } }] }, checkedAt: new Date().toISOString() });
    await expect(prepareSeriesInsertion(f.root, f.config, f.article.id, f.group.id, 2)).rejects.toThrow('缺少本地源文件');
  });
  it('keeps dry-run read-only and prints created IDs clearly in the human output', async () => {
    const f = await fixture([2]);
    const dry = JSON.parse((await run(['node', tsx, cli, 'series', 'add', f.article.id, '--series', f.group.id, '--order', '2', '--dry-run', '--json', '--root', f.root], { cwd: f.root })).stdout);
    expect(dry.status).toBe('PLANNED'); expect(dry.data.changes).toHaveLength(2);
    expect(await exists(path.join(f.root, '.blog-store/writing-transactions'))).toBe(false);
    await expect(run(['node', tsx, cli, 'series', 'add', f.article.id, '--series', f.group.id, '--order', '2', '--json', '--root', f.root], { cwd: f.root })).rejects.toThrow('CONFIRMATION_REQUIRED');
    expect((await metadata(f.root, f.article.file)).series).toBeUndefined();
    expect(await exists(path.join(f.root, '.blog-store/writing-transactions'))).toBe(false);
    const created = await run(['node', tsx, cli, 'series', 'new', '--title', '新系列', '--category', 'play', '--description', '测试', '--yes', '--root', f.root], { cwd: f.root });
    expect(created.stdout).toMatch(/ID：[a-f0-9-]{36}/); expect(created.stdout).toContain('栏目：闲暇娱乐');
  });
  it('runs the complete Chinese search, creation, search and ID insertion command flow', async () => {
    const f = await fixture();
    const invoke = async (args: string[]) => JSON.parse((await run(['node', tsx, cli, ...args, '--json', '--root', f.root], { cwd: f.root })).stdout);
    const article = await invoke(['new', '--category', 'play', '--title', '完整命令流程测试文章']);
    const found = await invoke(['search', '完整命令流程测试文章']);
    expect(found.data.matches.map((item: { id: string }) => item.id)).toEqual([article.data.id]);
    const group = await invoke(['series', 'new', '--category', 'play', '--title', '完整命令流程测试系列', '--yes']);
    const series = await invoke(['series', 'search', '完整命令流程测试系列']);
    expect(series.data.matches.map((item: { id: string }) => item.id)).toEqual([group.data.id]);
    const inserted = await invoke(['series', 'add', article.data.id, '--series', group.data.id, '--order', '1', '--yes']);
    expect(inserted).toMatchObject({ status: 'UPDATED', data: { articleId: article.data.id, seriesId: group.data.id, order: 1 } });
    expect((await invoke(['meta', article.data.id])).data.series).toEqual({ id: group.data.id, order: 1 });
  }, 15000);
});
