import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicWrite, BlogError, exists } from '../../src/lib/blog/files';
import { articleCatalogue } from './catalogue';
import { formatMarkdownSpacing, prepareFormat, commitFormat } from './format';
import { main } from './index';
import type { PromptDriver } from './prompts';
import { assertNoPendingWrites, prepareWritingTransaction } from './writing-transactions';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(body = '我们正在使用AI改变世界。') {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sachi-format-'))); roots.push(root);
  const id = randomUUID();
  const file = 'content/闲暇娱乐/2026-10-10/index.md';
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  const prefix = `\uFEFF---\r\nid: ${id}\r\ntitle: 我们使用AI # 保留注释\r\nslug: writing-ai\r\ncreatedAt: "2026-10-10T09:00:00+08:00"\r\nflow:\r\n  image: ./assets/尚未准备AI.png\r\n  width: 180\r\n---\r\n\r\n`;
  const raw = prefix + body.replaceAll('\n', '\r\n');
  await writeFile(path.join(root, file), raw);
  await mkdir(path.join(root, '.blog-store/snapshots'), { recursive: true });
  await writeFile(path.join(root, '.blog-store/snapshots/public.json'), '{"body":"旧的公开AI版本"}');
  return { root, id, file, prefix, raw };
}
function capture() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  return { json: () => JSON.parse(String(log.mock.calls.at(-1)![0])), text: () => log.mock.calls.map(([value]) => value).join('\n'), review: () => error.mock.calls.map(([value]) => value).join('\n') };
}
const disabled: PromptDriver = { enabled: false, select: async () => { throw new Error('unexpected prompt'); }, checkbox: async () => [], input: async () => '', confirm: async () => false };

describe('source-preserving Chinese/English spacing', () => {
  it.each([
    ['我们正在使用AI改变世界', '我们正在使用 AI 改变世界'],
    ['使用GPT-4和Node.js开发C++工具与C#代码，尝试3D绘图。', '使用 GPT-4 和 Node.js 开发 C++ 工具与 C# 代码，尝试 3D 绘图。'],
    ['2026年我们用AI写作，已经有 AI 空格。', '2026年我们用 AI 写作，已经有 AI 空格。'],
    ['中文**AI**文字与*React*组件以及~~Vue~~实践。', '中文 **AI** 文字与 *React* 组件以及 ~~Vue~~ 实践。'],
    ['**中文AI**改变，用[**AI**](https://example.org/中文AI)改变。', '**中文 AI** 改变，用 [**AI**](https://example.org/中文AI) 改变。'],
    ['用[AI](./assets/中文AI.pdf "中文AI标题")改变。[AI][ref]中文\n\n[ref]: https://example.org/中文AI "中文AI标题"', '用 [AI](./assets/中文AI.pdf "中文AI标题") 改变。[AI][ref] 中文\n\n[ref]: https://example.org/中文AI "中文AI标题"'],
    ['中**A**I文与中A**I**文。', '中 **A**I 文与中 A**I** 文。'],
    ['𠮷AI𠮷与中文&#65;I文字，中文\\A文字。', '𠮷 AI 𠮷与中文 &#65;I 文字，中文\\A 文字。'],
    ['# 使用AI\n\n> 引用AI内容\n\n- 记录AI想法\n\n| 中文AI表头 |\n| --- |\n| 中文AI内容 |', '# 使用 AI\n\n> 引用 AI 内容\n\n- 记录 AI 想法\n\n| 中文 AI 表头 |\n| --- |\n| 中文 AI 内容 |'],
    ['::使用AI创作。\\\n::继续AI写作。  \n\n末尾AI正文', '::使用 AI 创作。\\\n::继续 AI 写作。  \n\n末尾 AI 正文'],
    ['在B站看A股与H股介绍，再使用AI。', '在B站看A股与H股介绍，再使用 AI。'],
    ['中文ＡＩ文字与café文字。', '中文 ＡＩ 文字与 café 文字。'],
  ])('formats %s without altering markup or existing whitespace', (before, after) => {
    const result = formatMarkdownSpacing(before);
    expect(result.body).toBe(after);
    expect(formatMarkdownSpacing(after)).toEqual({ body: after, insertedSpaces: 0 });
  });

  it('protects fenced and indented code, inline code, math, images, HTML, URLs and definitions', () => {
    const source = '```ts\nconst 中文AI = "中文AI";\n```\n\n    中文AI代码\n\n中文`AI中文`文字和中文$AI中文$文字。\n\n$$\n中文AI公式\n$$\n\n![中文AI图片](./assets/中文AI.png "中文AI标题")\n\n![中文AI][image]\n\n[image]: ./assets/中文AI.png\n\n访问<https://example.org/中文AI>，邮件<ai@example.org>。\n\n<div>中文AI原始HTML</div>';
    expect(formatMarkdownSpacing(source)).toEqual({ body: source, insertedSpaces: 0 });
  });

  it('honors custom exceptions across formatted text and rejects invalid exceptions', () => {
    expect(formatMarkdownSpacing('维生素B12与中文**OpenAI**项目，再使用AI。', ['维生素B12', 'OpenAI']).body).toBe('维生素B12与中文**OpenAI**项目，再使用 AI。');
    expect(() => formatMarkdownSpacing('中文AI', [''])).toThrow('--ignore');
    expect(() => formatMarkdownSpacing('中文AI', ['AI\n中文'])).toThrow('--ignore');
  });
});

describe('CLI article formatting and transactional writes', () => {
  it('runs the installed CLI with JSON dry-run, explicit writes and an unchanged second run', async () => {
    const f = await fixture('使用AI。\n\n```ts\nconst 中文AI = 1;\n```');
    const execute = promisify(execFile);
    const call = (args: string[]) => execute(process.execPath, [path.resolve('bin/blog.mjs'), 'format', 'writing-ai', '--root', f.root, '--json', ...args]);
    expect(JSON.parse((await call(['--dry-run'])).stdout)).toMatchObject({ command: 'format', status: 'PLANNED', data: { insertedSpaces: 1 } });
    await expect(call([])).rejects.toMatchObject({ code: 2, stderr: '', stdout: expect.stringContaining('CONFIRMATION_REQUIRED') });
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.raw);
    expect(JSON.parse((await call(['--yes'])).stdout).status).toBe('UPDATED');
    expect(JSON.parse((await call(['--yes'])).stdout).status).toBe('UNCHANGED');
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toContain('const 中文AI = 1;');
  }, 15_000);

  it('shows JSON line changes during dry-run without touching source, cache or snapshots', async () => {
    const f = await fixture('使用AI。\n\n尾行AI  \n'); const output = capture();
    await main(['format', f.id, '--root', f.root, '--dry-run', '--json'], { prompts: disabled });
    expect(output.json()).toMatchObject({ command: 'format', status: 'PLANNED', data: { changedArticles: 1, insertedSpaces: 2, articles: [{ id: f.id, changes: [{ line: 11, before: '使用AI。', after: '使用 AI。' }, { line: 13, before: '尾行AI  ', after: '尾行 AI  ' }] }] } });
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.raw);
    expect(await exists(path.join(f.root, '.blog'))).toBe(false);
    expect(await exists(path.join(f.root, '.blog-store/writing-transactions'))).toBe(false);
    expect(await readFile(path.join(f.root, '.blog-store/snapshots/public.json'), 'utf8')).toBe('{"body":"旧的公开AI版本"}');
  });

  it('writes only spacing, preserves BOM/CRLF/frontmatter/trailing spaces and is idempotent', async () => {
    const f = await fixture('使用AI。\\\n::尾行AI  '); const output = capture();
    await main(['format', 'writing-ai', '--root', f.root, '--yes', '--json'], { prompts: disabled });
    expect(output.json().status).toBe('UPDATED');
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.prefix + '使用 AI。\\\r\n::尾行 AI  ');
    await main(['format', path.join(f.root, f.file), '--root', f.root, '--json'], { prompts: disabled });
    expect(output.json()).toMatchObject({ status: 'UNCHANGED', data: { insertedSpaces: 0 } });
    expect(await readFile(path.join(f.root, '.blog-store/snapshots/public.json'), 'utf8')).toBe('{"body":"旧的公开AI版本"}');
  });

  it('requires an explicit selection and confirmation, supports cancellation and leaves source unchanged', async () => {
    const f = await fixture(); const output = capture();
    await expect(main(['format', '--root', f.root, '--json'], { prompts: disabled })).rejects.toMatchObject({ status: 'INPUT_REQUIRED' });
    await expect(main(['format', f.id, '--root', f.root], { prompts: disabled })).rejects.toMatchObject({ status: 'CONFIRMATION_REQUIRED' });
    expect(output.review()).toContain('- 我们正在使用AI改变世界。\n+ 我们正在使用 AI 改变世界。');
    await expect(main(['format', f.id, '--root', f.root], { prompts: { ...disabled, enabled: true } })).rejects.toMatchObject({ status: 'CANCELLED' });
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.raw);
    expect(await exists(path.join(f.root, '.blog-store/writing-transactions'))).toBe(false);
  });

  it('selects incomplete articles through the menu and defaults to a read-only plan', async () => {
    const f = await fixture(); const output = capture();
    const prompts = { ...disabled, enabled: true, select: vi.fn(async (_title: string, choices: Array<{ value: string }>) => choices.some((choice) => choice.value === 'format') ? 'format' : 'plan'), checkbox: vi.fn(async () => [f.file]) };
    await main(['--root', f.root], { prompts });
    expect(output.text()).toContain('第 11 行');
    expect(output.text()).toContain('未写入文件');
    expect(prompts.checkbox).toHaveBeenCalledOnce();
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.raw);
  });

  it('handles legacy IDs and paths, repeated selectors, exceptions and unrelated invalid articles', async () => {
    const f = await fixture('使用OpenAI与AI。');
    await writeFile(path.join(f.root, 'content/旧笔记.md'), '---\ntitle: 旧的AI笔记\ndate: 2026-10-10\ncategory: life\n---\n旧的AI正文');
    await writeFile(path.join(f.root, 'content/坏文件.md'), '未完成的元数据');
    const legacy = (await articleCatalogue(f.root)).articles.find((article) => article.file.endsWith('旧笔记.md'))!;
    const plan = await prepareFormat(f.root, [legacy.id, legacy.file, f.file.replace('/index.md', '')], ['OpenAI']);
    expect(plan.files).toHaveLength(2);
    expect(plan.files[1].after).toContain('使用OpenAI与 AI。');
    await expect(prepareFormat(f.root, ['../../outside.md'])).rejects.toThrow('唯一正式文章');
  });

  it('refuses external edits after review and rolls back a multi-file write failure', async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, 'content/另一篇.md'), '---\ntitle: 另一篇\ndate: 2026-10-10\ncategory: life\n---\n中文AI正文');
    const plan = await prepareFormat(f.root, [f.id, '另一篇']);
    await writeFile(path.join(f.root, f.file), f.raw + '\r\n额外编辑');
    await expect(commitFormat(f.root, plan)).rejects.toThrow('确认后文章发生变化');
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toBe(f.raw + '\r\n额外编辑');
    await writeFile(path.join(f.root, f.file), f.raw);
    let writes = 0;
    await expect(commitFormat(f.root, plan, async (file, value) => { if (++writes === 2) throw new Error('写入失败'); await atomicWrite(file, value); })).rejects.toThrow('写入失败');
    for (const change of plan.files) expect(await readFile(path.join(f.root, change.file), 'utf8')).toBe(change.before);
    await expect(assertNoPendingWrites(f.root)).resolves.toBeUndefined();
  });

  it('keeps interrupted transactions during dry-run, recovers on execution and rejects recovery conflicts', async () => {
    const f = await fixture(); capture();
    const plan = await prepareFormat(f.root, [f.id]);
    await prepareWritingTransaction(f.root, plan.files);
    await atomicWrite(path.join(f.root, f.file), plan.files[0].after);
    await main(['format', f.id, '--root', f.root, '--dry-run', '--json'], { prompts: disabled });
    await expect(assertNoPendingWrites(f.root)).rejects.toMatchObject({ status: 'WRITING_RECOVERY_REQUIRED' });
    await main(['format', f.id, '--root', f.root, '--yes', '--json'], { prompts: disabled });
    await expect(assertNoPendingWrites(f.root)).resolves.toBeUndefined();
    const next = [{ file: f.file, before: plan.files[0].after, after: plan.files[0].after + '\r\n待写入' }];
    await prepareWritingTransaction(f.root, next);
    await writeFile(path.join(f.root, f.file), next[0].before + '\r\n外部修改');
    await expect(main(['format', f.id, '--root', f.root, '--yes', '--json'], { prompts: disabled })).rejects.toBeInstanceOf(BlogError);
    expect(await readFile(path.join(f.root, f.file), 'utf8')).toContain('外部修改');
  });
});
