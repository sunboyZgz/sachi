import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { findNames, searchNames } from './search';
import { sha256, walk } from '../../src/lib/blog/files';
import { newSeries } from './series';
import { run } from './process';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(path.join(os.tmpdir(), 'sachi-search-')); temporary.push(root); await mkdir(path.join(root, 'content')); return root; }
async function article(root: string, title: string, day: string, fields = '', body = '![未完成图片](./assets/missing.png)\n\n**正在写') {
  const file = `content/闲暇娱乐/${day}/index.md`; await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  const id = randomUUID(); await writeFile(path.join(root, file), `---\nid: ${id}\ntitle: ${title}\n${fields}---\n\n${body}`); return { id, file };
}
const names = [
  { id: 'a', title: '这个博客，与那些变轻的我学会了', category: 'play', file: 'a' },
  { id: 'b', title: '朝思暮想的玩具和博客', category: 'play', file: 'b' },
  { id: 'c', title: '查找系列工具', category: 'play', file: 'c' },
  { id: 'd', title: 'ＣＬＩ 博客', category: 'play', file: 'd' },
];
describe('Chinese name search', () => {
  it('uses partial names, all keywords, typo tolerance and width/case normalization', () => {
    expect(findNames(names, '朝思暮想').map((item) => item.id)).toEqual(['b']);
    expect(findNames(names, '博客 玩具').map((item) => item.id)).toEqual(['b']);
    expect(findNames(names, '查找系列工俱').map((item) => item.id)).toEqual(['c']);
    expect(findNames(names, '  cli   博客  ')[0].id).toBe('d');
    expect(findNames(names, '量子物理')).toEqual([]);
    expect(() => findNames(names, ' \n ')).toThrow('非空');
  });
  it('puts exact and containing names ahead of fuzzy ones and keeps ties stable', () => {
    const items = [{ ...names[2], id: 'e', title: '查找系列工具入门', file: 'z' }, names[2], { ...names[2], id: 'f', file: '0' }];
    expect(findNames(items, '查找系列工具').map((item) => item.id)).toEqual(['f', 'c', 'e']);
    expect(findNames(items.toReversed(), '查找系列工具').map((item) => item.id)).toEqual(['f', 'c', 'e']);
  });
  it('searches unfinished articles and legacy IDs without touching files or checking body/media', async () => {
    const root = await fixture();
    const modern = await article(root, '朝思暮想的玩具', '2026-10-12', 'flow: { image: missing }\n');
    await writeFile(path.join(root, 'content/old.md'), '---\ntitle: 朝思暮想的玩具\ncategory: play\n---\n\n旧文章');
    await article(root, '朝思暮想的样例', '2026-10-13', 'fixture: true\n');
    await writeFile(path.join(root, 'content/bad.md'), '---\ntitle: [未完成\n---\n');
    const before = await walk(root); const bytes = await Promise.all(before.map((file) => readFile(path.join(root, file))));
    const result = await searchNames(root, 'article', '朝思暮想');
    expect(result.matches.map((item) => item.id)).toEqual([`legacy-${sha256('old.md').slice(0, 24)}`, modern.id]);
    expect(result.issues).toHaveLength(1);
    expect(await walk(root)).toEqual(before);
    expect(await Promise.all(before.map((file) => readFile(path.join(root, file))))).toEqual(bytes);
  });
  it('returns same-name series candidates with different IDs and never chooses one', async () => {
    const root = await fixture();
    const one = await newSeries(root, { title: '我学会了', category: 'play' });
    const two = await newSeries(root, { title: '我学会了', category: 'learn' });
    expect((await searchNames(root, 'series', '我学会了')).matches.map((item) => item.id).sort()).toEqual([one.id, two.id].sort());
  });
  it('exposes a single JSON response through the real command and rejects missing input', async () => {
    const root = await fixture(); const created = await article(root, '朝思暮想的玩具', '2026-10-12');
    const tsx = path.resolve('node_modules/tsx/dist/cli.mjs'); const cli = path.resolve('tools/blog-cli/index.ts');
    const result = await run(['node', tsx, cli, 'search', '朝思暮想', '--root', root, '--json'], { cwd: root });
    expect(JSON.parse(result.stdout)).toMatchObject({ command: 'search', status: 'READ', data: { matches: [{ id: created.id }] } });
    await expect(run(['node', tsx, cli, 'search', '--root', root, '--json'], { cwd: root })).rejects.toThrow('INPUT_REQUIRED');
  });
});
