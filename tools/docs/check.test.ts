import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicWrite } from '../../src/lib/blog/files';
import { commandCatalog, parseCli } from '../blog-cli/arguments';
import { checkDocs } from './check';
import { referencePages } from './reference';
import { tokenizeChinese } from '../../docs-site/.vitepress/search';
import { docsBase } from '../../docs-site/.vitepress/settings';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs-site');
const temporary: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sachi-handbook-test-'));
  temporary.push(root);
  await cp(source, root, { recursive: true, filter: (file) => !['node_modules', 'dist', 'cache', '.temp'].includes(path.basename(file)) });
  return root;
}
afterEach(async () => { for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('task-oriented CLI handbook', () => {
  it('loads the documentation base from JSON and falls back only when the file is absent', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sachi-docs-config-')); temporary.push(root);
    const file = path.join(root, 'docs.config.json');
    expect(docsBase(file, { DOCS_BASE: '/legacy/' })).toBe('/legacy/');
    expect(docsBase(file, {})).toBe('/');
    await atomicWrite(file, JSON.stringify({ schemaVersion: 1, base: '/handbook/' }));
    expect(docsBase(file, { DOCS_BASE: '/legacy/' })).toBe('/handbook/');
    for (const raw of ['', '{}', '{"schemaVersion":1}', '{"schemaVersion":1,"base":"handbook"}', '{"schemaVersion":1,"base":"/","typo":true}']) {
      await atomicWrite(file, raw);
      expect(() => docsBase(file, { DOCS_BASE: '/legacy/' })).toThrow();
    }
  });
  it('keeps operational commands and live Markdown examples next to the steps they explain', async () => {
    const { readdir } = await import('node:fs/promises');
    for (const directory of ['start', 'writing', 'preview', 'release', 'backup', 'setup', 'troubleshooting']) {
      for (const file of await readdir(path.join(source, directory))) {
        if (!file.endsWith('.md')) continue;
        const text = await readFile(path.join(source, directory, file), 'utf8');
        const steps = text.slice(text.indexOf('## 操作步骤'), text.indexOf('## 确认结果'));
        expect(/```|<<< @\//.test(steps), `${directory}/${file} should teach the syntax beside its steps`).toBe(true);
        expect(text.slice(text.indexOf('## 参数方式'))).not.toContain('```sh');
      }
    }
    for (const [file, examples] of Object.entries({ 'writing/images.md': ['image', 'image-reference', 'cover'], 'writing/flow.md': ['flow', 'flow-manual'], 'writing/video.md': ['video'], 'writing/attachments.md': ['attachment'], 'writing/links.md': ['article-link'], 'setup/media.md': ['media'] })) {
      const text = await readFile(path.join(source, file), 'utf8');
      const steps = text.slice(text.indexOf('## 操作步骤'), text.indexOf('## 确认结果'));
      for (const example of examples) expect(steps).toContain(`<BlogExample example="${example}"`);
    }
  });
  it('ignores generated VitePress files without excluding maintained config sources', async () => {
    const { ESLint } = await import('eslint');
    const lint = new ESLint({ cwd: path.dirname(source) });
    expect(await lint.isPathIgnored(path.join(source, '.vitepress/.temp/setup_seo.md.js'))).toBe(true);
    expect(await lint.isPathIgnored(path.join(source, '.vitepress/config.ts'))).toBe(false);
  });
  it('uses a self-contained Chinese tokenizer that survives browser serialization', () => {
    const browserTokenize = runInNewContext(`(${tokenizeChinese.toString()})`, { Intl }) as typeof tokenizeChinese;
    expect(browserTokenize('发布选中的文章')).toContain('发布');
    expect(browserTokenize('blog publish --dry-run')).toEqual(tokenizeChinese('blog publish --dry-run'));
  });
  it('covers every command and keeps generated flags aligned with actual help', async () => {
    expect(await checkDocs()).toEqual({ pages: 80, commands: 24 });
    for (const command of commandCatalog()) {
      const page = referencePages()[`reference/commands/${command.name}.md`];
      const help = parseCli([command.name, '--help']).help;
      for (const option of command.options) {
        expect(page).toContain(option.flags);
        expect(help).toContain(option.flags);
      }
      for (const child of command.subcommands) {
        const childHelp = parseCli([command.name, child.name, '--help']).help;
        for (const option of child.options) {
          expect(page).toContain(option.flags);
          expect(childHelp).toContain(option.flags);
        }
      }
    }
  });
  it('prunes dependency directories before traversal or symlink validation', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'node_modules'));
    await symlink(source, path.join(root, 'node_modules', 'dependency'));
    expect(await checkDocs(root)).toEqual({ pages: 80, commands: 24 });
  });
  it('rejects task pages without result verification', async () => {
    const root = await fixture(); const file = path.join(root, 'writing/new.md');
    await atomicWrite(file, (await readFile(file, 'utf8')).replace('## 确认结果', '## 其他'));
    await expect(checkDocs(root)).rejects.toThrow('任务页缺少章节');
  });
  it('rejects stale command references instead of silently publishing them', async () => {
    const root = await fixture();
    await atomicWrite(path.join(root, 'reference/commands/new.md'), 'outdated reference');
    await expect(checkDocs(root)).rejects.toThrow('参数参考未同步');
  });
  it('checks ordinary links and subpath-aware homepage links', async () => {
    const root = await fixture(); const file = path.join(root, 'index.md');
    await atomicWrite(file, (await readFile(file, 'utf8')).replace("withBase('/writing/new.html')", "withBase('/writing/missing.html')") + '\n[缺失页面](/missing)\n');
    await expect(checkDocs(root)).rejects.toThrow('链接目标缺失：index.md -> /writing/missing');
  });
  it('rejects document source links exposing private blog content', async () => {
    const root = await fixture(); const file = path.join(root, 'index.md');
    await atomicWrite(file, (await readFile(file, 'utf8')) + '\n<img src="/content/private.png">\n');
    await expect(checkDocs(root)).rejects.toThrow('不允许索引或链接私有内容');
  });
  it('requires source snippets and rendered previews for custom Markdown operations', async () => {
    const root = await fixture(); const file = path.join(root, 'writing/flow.md');
    await atomicWrite(file, (await readFile(file, 'utf8')).replace('<BlogExample example="flow" />', ''));
    await expect(checkDocs(root)).rejects.toThrow('示例源码或生成效果缺失：writing/flow.md / flow');
  });
  it('rejects unknown previews and broken teaching asset links', async () => {
    const root = await fixture(); const file = path.join(root, 'writing/images.md');
    await atomicWrite(file, (await readFile(file, 'utf8')) + '\n<BlogExample example="nonexistent" />\n[不存在的素材](/examples/missing.png)\n');
    await expect(checkDocs(root)).rejects.toThrow('未知效果示例');
    await expect(checkDocs(root)).rejects.toThrow('教学素材缺失');
  });
});
