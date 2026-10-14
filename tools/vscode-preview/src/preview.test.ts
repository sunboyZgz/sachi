import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArticleIntro } from '../../../src/components/ArticleIntro';
import { ArticleProse } from '../../../src/components/ArticleProse';
import { parseMarkdown } from '../../../src/lib/markdown';
import { contourFromPixels } from '../../../src/lib/image-contour';
import { articleLocation, buildPreview, findInternalTarget, internalLink, locateArticle } from './preview';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const id = '51f3e126-f6a0-4ef3-a4fb-6dca72b85afd';
const raw = (body = '正文。', fields = '') => `---\nid: ${id}\ntitle: 编辑器文章\ncreatedAt: "2026-10-09T19:30:00Z"\ntags: [预览, 测试]\n${fields}---\n\n${body}`;

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sachi-preview-unit-'));
  roots.push(root);
  const file = path.join(root, 'content/闲暇娱乐/2026-10-10/index.md');
  for (const directory of ['content/闲暇娱乐/2026-10-10/assets', 'src/styles', 'src/assets/avatar', 'public/assets']) await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(file, raw('磁盘上的旧正文。'));
  await writeFile(path.join(root, 'blog.config.json'), JSON.stringify({ schemaVersion: 1, timezone: 'Asia/Shanghai' }));
  for (const file of ['src/styles/tokens.css', 'src/styles/site.css', 'src/styles/code-highlight.css', 'src/styles/math.css', 'src/assets/avatar/avatar-half.png']) await writeFile(path.join(root, file), 'test');
  const location = articleLocation(root, file)!;
  return { root, file, location, resourceUri: (file: string) => `https://resource.test/${encodeURIComponent(path.relative(root, file))}` };
}

describe('VS Code article preview adapter', () => {
  it('keeps absolute editor lines with frontmatter, leading whitespace, CRLF and document versions', async () => {
    const fixtureData = await fixture();
    const input = raw('\n\n  正文。\r\n下一行。').replaceAll('\n', '\r\n').replaceAll('\r\r\n', '\r\n');
    const { message } = await buildPreview({ ...fixtureData, raw: input, revision: 4, dirty: true, documentVersion: 7, syncEnabled: false });
    const beforeBody = input.slice(0, input.indexOf('正文。'));
    expect(message.source).toMatchObject({ version: 7, syncEnabled: false, clickEnabled: true, title: { line: 3, column: 1 }, totalLines: input.split('\n').length,
      origin: { lineOffset: beforeBody.split('\n').length - 1, columnOffset: 2 } });
    expect(message.post.body).toBe('正文。\n下一行。');
  });

  it('recognizes only real article paths and explicit fixtures', () => {
    expect(articleLocation('/blog', '/blog/README.md')).toBeNull();
    expect(articleLocation('/blog', '/blog/content/unknown/2026-10-10/index.md')).toBeNull();
    expect(articleLocation('/blog', '/blog/content/蘸豆！！/2026-10-10-02/index.md')?.legacy).toBe(false);
    expect(articleLocation('/blog', '/blog/tests/fixtures/content/note.md')?.contentRoot).toBe('/blog/tests/fixtures/content');
    expect(articleLocation('/blog', '/outside/content/note.md')).toBeNull();
  });

  it('uses the unsaved buffer with shared identity, timezone and metadata rules without writes', async () => {
    const fixtureData = await fixture();
    const { message } = await buildPreview({ ...fixtureData, raw: raw('未保存正文。'), revision: 2, dirty: true });
    expect(message.post).toMatchObject({ id, slug: id, category: 'play', status: '记录', date: '2026-10-10', tags: ['预览', '测试'], body: '未保存正文。' });
    expect(message.dirty).toBe(true);
    expect(await readFile(fixtureData.file, 'utf8')).toBe(raw('磁盘上的旧正文。'));
    const html = renderToStaticMarkup(createElement(ArticleIntro, { post: message.post }));
    expect(html).toContain('闲暇娱乐'); expect(html).toContain('2026.10.10'); expect(html).toContain('预览');
  });

  it('keeps GFM, media, reference images, posters, attachments and article IDs in the real renderer', async () => {
    const fixtureData = await fixture();
    const assets = path.join(path.dirname(fixtureData.file), 'assets');
    for (const file of ['photo.png', 'demo.mp4', 'notes.pdf']) await writeFile(path.join(assets, file), 'bytes');
    const body = `![引用图片][photo]\n\n[photo]: ./assets/photo.png\n\n![视频](./assets/demo.mp4)\n\n[附件](./assets/notes.pdf)\n\n[文章](blog:${id})\n\n## 测试标题\n\n| 一 | 二 |\n| --- | --- |\n| 内容 | 数据 |\n\n- [x] 完成\n\n\`\`\`ts\nconst a = "<tag>";\n\`\`\``;
    const result = await buildPreview({ ...fixtureData, raw: raw(body), revision: 1, dirty: true,
      readText: async (file) => file.endsWith('media.yaml') ? 'assets:\n  ./assets/demo.mp4:\n    poster: ./assets/photo.png\n' : readFile(file, 'utf8') });
    expect(result.message.warnings).toEqual([]);
    const post = result.message.post;
    expect(post.assets['./assets/demo.mp4'].poster).toBe(post.assets['./assets/photo.png'].url);
    expect(post.assets[`blog:${id}`].url).toBe(internalLink(`blog:${id}`));
    const html = renderToStaticMarkup(createElement(ArticleProse, { parsed: parseMarkdown(post.body), assets: post.assets, flowKey: 'test' }));
    expect(html).toContain('<video'); expect(html).toContain('poster='); expect(html).toContain('<figcaption>引用图片');
    expect(html).toContain('<table>'); expect(html).toContain('type="checkbox"'); expect(html).toContain('class="code-block"');
    expect(html.replace(/<[^>]+>/g, '')).toContain('const a = &quot;&lt;tag&gt;&quot;;'); expect(html).toContain('href="#');
    expect(html).toContain('hljs-keyword');
    expect(result.message.styles).toHaveLength(4);
    expect(result.message.styles[2]).toContain('code-highlight.css');
    expect(result.message.styles[3]).toContain('math.css');
    expect(result.links.size).toBe(3);
  });

  it('preserves every paragraph when flow is unfinished and rejects malformed metadata', async () => {
    const fixtureData = await fixture();
    const body = '第一段 **正在编辑**。\n\n![图片](./assets/absent.png)\n\n## 后文\n\n最后一段。';
    const result = await buildPreview({ ...fixtureData, raw: raw(body, 'flow:\n  image: ./assets/absent.png\n'), revision: 1, dirty: true });
    expect(result.message.post.flow).toMatchObject({ image: './assets/absent.png' }); expect(result.message.post.body).toBe(body);
    expect(result.message.warnings.join(' ')).toContain('暂用普通排版');
    await expect(buildPreview({ ...fixtureData, raw: raw().replace('title: 编辑器文章', 'title: [未完成'), revision: 2, dirty: true })).rejects.toThrow('YAML');
    await expect(buildPreview({ ...fixtureData, raw: raw().replace('tags: [预览, 测试]', 'tags: 不是数组'), revision: 2, dirty: true })).rejects.toThrow();
  });

  it('keeps valid per-image settings while another configuration is incomplete', async () => {
    const fixtureData = await fixture();
    await writeFile(path.join(path.dirname(fixtureData.file), 'assets/photo.png'), 'bytes');
    const result = await buildPreview({ ...fixtureData, raw: raw('![图](./assets/photo.png)\n\n有效区域。\n\n---\n\n另一段。', 'flow:\n  - image: ./assets/photo.png\n    width: 240\n  - width: 180\n'), revision: 1, dirty: true });
    expect(result.message.post.flow).toMatchObject([{ image: './assets/photo.png', width: 240 }]);
    const parsed = parseMarkdown(result.message.post.body, result.message.post.flow, result.message.post.assets, result.message.source.origin, { tolerant: true });
    expect(parsed.flows).toHaveLength(1);
    expect(result.message.warnings.join(' ')).toContain('flow[2]');
    expect(result.message.post.body).toContain('另一段');
  });

  it('blocks traversal, unsupported protocols and symbolic links while rendering the rest', async () => {
    const fixtureData = await fixture();
    const outside = path.join(fixtureData.root, 'secret.txt');
    await writeFile(outside, 'private');
    await symlink(outside, path.join(path.dirname(fixtureData.file), 'assets/leak.txt'));
    const body = '[越界](./assets/../../secret.txt)\n\n[链接](./assets/leak.txt)\n\n[文件](file:///etc/passwd)\n\n剩余正文。';
    const result = await buildPreview({ ...fixtureData, raw: raw(body), revision: 1, dirty: true });
    expect(result.links.size).toBe(0);
    expect(result.message.warnings).toHaveLength(3);
    expect(Object.values(result.message.post.assets).every((asset) => asset.url === '')).toBe(true);
    expect(result.message.post.body).toContain('剩余正文');
  });

  it('opens draft article and series links only within the active content collection', async () => {
    const fixtureData = await fixture();
    const directory = path.join(fixtureData.root, 'content/series');
    await mkdir(directory);
    await writeFile(path.join(directory, `${id}.yaml`), `id: ${id}\nslug: notes\ntitle: 系列\ncategory: play\n`);
    expect(await findInternalTarget(fixtureData.location, `blog:${id}`, (file) => readFile(file, 'utf8'))).toMatchObject({ file: fixtureData.file });
    expect(await findInternalTarget(fixtureData.location, `/article/${id}/`, (file) => readFile(file, 'utf8'))).toMatchObject({ file: fixtureData.file });
    expect(await findInternalTarget(fixtureData.location, '/series/notes/', (file) => readFile(file, 'utf8'))).toMatchObject({ file: path.join(directory, `${id}.yaml`) });
    expect(await findInternalTarget(fixtureData.location, 'blog:unknown', (file) => readFile(file, 'utf8'))).toBeNull();
  });

  it('keeps valid local resources when unfinished Markdown has raw HTML and blocks remote images', async () => {
    const fixtureData = await fixture();
    await writeFile(path.join(path.dirname(fixtureData.file), 'assets/photo.png'), 'bytes');
    const body = '![本地图片](./assets/photo.png)\n\n<div>尚未完成</div>\n\n![远程图片](https://example.org/photo.png)\n\n[外部文章](https://example.org/article)';
    const result = await buildPreview({ ...fixtureData, raw: raw(body), revision: 1, dirty: true });
    expect(result.message.post.assets['./assets/photo.png'].url).toContain('https://resource.test/');
    expect(result.message.post.assets['https://example.org/photo.png'].url).toBe('');
    expect(result.allowedExternal).toEqual(new Set(['https://example.org/article']));
    expect(result.message.warnings).toHaveLength(2);
  });

  it('shares the alpha threshold and preserves transparent canvas margins', () => {
    const pixels = new Uint8Array(4 * 2 * 4);
    pixels[3] = 7;
    pixels[4 * 5 + 3] = 8;
    pixels[4 * 6 + 3] = 255;
    expect(contourFromPixels(pixels, 4, 2)).toEqual({ height: 2, rows: [null, [0.25, 0.75]] });
    expect(() => contourFromPixels(new Uint8Array(16), 2, 2)).toThrow('完全透明');
  });

  it('opens a full draft archive and maps its own image rather than the working article image', async () => {
    const f = await fixture();
    const archive = path.join(f.root, '.blog-store/drafts/versions', id, 'saved-version');
    const file = path.join(archive, 'content/闲暇娱乐/2026-10-10/index.md');
    await mkdir(path.join(path.dirname(file), 'assets'), { recursive: true });
    await writeFile(path.join(path.dirname(file), 'assets/photo.png'), '旧稿图片');
    await writeFile(path.join(path.dirname(f.file), 'assets/photo.png'), '当前图片');
    const input = raw('旧稿 &amp; 正文。\n\n![旧插画](./assets/photo.png)', 'flow:\n  image: ./assets/photo.png\n  width: 180\n');
    const location = articleLocation(f.root, file, input)!;
    expect(location.contentRoot).toBe(path.join(archive, 'content'));
    const result = await buildPreview({ ...f, location, raw: input, revision: 1, dirty: false });
    expect(decodeURIComponent(result.message.post.assets['./assets/photo.png'].url)).toContain('.blog-store/drafts/versions');
    expect(result.message.post.flow).toMatchObject({ width: 180 });
    expect(result.message.source.origin.lineOffset).toBe(input.slice(0, input.indexOf('旧稿')).split('\n').length - 1);
    expect(result.message.warnings).toEqual([]);
  });

  it('uses exported legacy public assets, isolates neighbouring links and never borrows missing live resources', async () => {
    const f = await fixture();
    const exported = path.join(f.root, 'draft-review/first');
    const file = path.join(exported, 'content/old.md');
    await mkdir(path.dirname(file), { recursive: true }); await mkdir(path.join(exported, 'public/assets'), { recursive: true });
    await writeFile(path.join(exported, 'public/assets/photo.png'), '旧图片');
    await writeFile(path.join(f.root, 'public/assets/missing.png'), '不属于旧稿的当前资源');
    const input = '---\ntitle: 导出旧稿\ncategory: life\ndate: 2026-10-10\n---\n\n![旧图片](/assets/photo.png)\n\n![缺图](/assets/missing.png)';
    await writeFile(file, input);
    const location = articleLocation(f.root, file, input)!;
    const result = await buildPreview({ ...f, location, raw: input, revision: 1, dirty: false });
    expect(location.assetRoot).toBe(path.join(exported, 'public/assets'));
    expect(decodeURIComponent(result.message.post.assets['/assets/photo.png'].url)).toContain('draft-review/first/public/assets/photo.png');
    expect(result.message.post.assets['/assets/missing.png'].url).toBe('');
    expect(await findInternalTarget(location, `blog:${id}`, (file) => readFile(file, 'utf8'))).toBeNull();
    expect(await findInternalTarget(location, '/article/old/', (file) => readFile(file, 'utf8'))).toEqual({ file, fragment: undefined });
  });

  it('accepts detached modern Markdown with explicit category and responds to unsaved category changes', async () => {
    const f = await fixture(); const file = path.join(f.root, 'writing/随手一稿.md');
    await mkdir(path.join(path.dirname(file), 'assets'), { recursive: true });
    await writeFile(path.join(path.dirname(file), 'assets/photo.png'), '本篇图片');
    const input = raw('未保存正文。\n\n![图片](./assets/photo.png)', 'category: life\n');
    const location = articleLocation(f.root, file, input)!;
    expect(location).toMatchObject({ detached: true, legacy: false, assetRoot: path.join(path.dirname(file), 'assets') });
    const first = await buildPreview({ ...f, location, raw: input, revision: 1, dirty: true });
    expect(first.message.post).toMatchObject({ id, category: 'life', body: '未保存正文。\n\n![图片](./assets/photo.png)' });
    const next = await buildPreview({ ...f, location, raw: input.replace('category: life', 'category: learn'), revision: 2, dirty: true });
    expect(next.message.post.category).toBe('learn');
  });

  it('supports a single file without any workspace/project using bundled styles and adjacent resources', async () => {
    const f = await fixture(); const file = path.join(f.root, 'standalone/稿件.md');
    await mkdir(path.join(path.dirname(file), 'assets'), { recursive: true });
    await writeFile(path.join(path.dirname(file), 'assets/photo.png'), '本地图片');
    const input = raw('独立正文。\n\n![图片](./assets/photo.png)', 'category: play\n');
    const location = await locateArticle(file, input);
    expect(location?.projectRoot).toBeUndefined();
    const result = await buildPreview({ location: location!, raw: input, revision: 1, dirty: true, resourceUri: f.resourceUri });
    expect(result.message.styles).toEqual([]); expect(result.message.avatar).toBe('');
    expect(result.message.warnings).toEqual([]);
    expect(result.message.post.assets['./assets/photo.png'].url).not.toBe('');
    expect(result.message.post.id).toBe(id);
  });

  it('locates a project above a narrowly opened workspace and styles external articles from a single Sachi workspace', async () => {
    const f = await fixture(); await writeFile(path.join(f.root, 'package.json'), '{"name":"sachi-blog"}');
    const nested = await locateArticle(f.file, raw(), [path.dirname(f.file)]);
    expect(nested?.projectRoot).toBe(f.root);
    const outside = await mkdtemp(path.join(tmpdir(), 'sachi-external-preview-')); roots.push(outside);
    const input = raw('外部正文', 'category: life\n'); const file = path.join(outside, 'article.md');
    const external = await locateArticle(file, input, [f.root]);
    expect(external).toMatchObject({ projectRoot: f.root, root: outside, detached: true });
    const result = await buildPreview({ location: external!, raw: input, revision: 1, dirty: true, resourceUri: f.resourceUri });
    expect(result.message.styles).toHaveLength(4);
    const ambiguous = await locateArticle(file, input, [f.root, path.join(f.root, 'another-workspace')]);
    expect(ambiguous?.projectRoot).toBeUndefined();
  });

  it('infers the closest column directory for detached files and refuses unrelated README/tutorial Markdown', async () => {
    const f = await fixture();
    expect(articleLocation(f.root, path.join(f.root, 'archive/生活旁白/手稿.md'), raw())?.pathCategory).toBe('life');
    expect(articleLocation(f.root, path.join(f.root, '闲暇娱乐/archive/生活旁白/手稿.md'), raw())?.pathCategory).toBe('life');
    expect(articleLocation(f.root, path.join(f.root, 'draft.md'), raw())).toBeNull();
    expect(await locateArticle(path.join(f.root, 'README.md'), '# 项目说明')).toBeNull();
    expect(await locateArticle(path.join(f.root, 'tutorial.md'), '---\ntitle: 教程\nscope: local\n---\n说明')).toBeNull();
    expect(await locateArticle(path.join(f.root, 'invalid.md'), raw('正文', 'category: life\n').replace(id, 'not-an-article-id'))).toBeNull();
    expect(await locateArticle(path.join(f.root, 'invalid-date.md'), raw('正文', 'category: life\n').replace('2026-10-09T19:30:00Z', '还没写时间'))).toBeNull();
  });

  it('uses adjacent assets for detached legacy manuscripts without a public directory', async () => {
    const f = await fixture(); const file = path.join(f.root, 'archive/old-note.md');
    await mkdir(path.join(path.dirname(file), 'assets'), { recursive: true });
    await writeFile(path.join(path.dirname(file), 'assets/photo.png'), '本地旧图');
    const input = '---\ntitle: 手写旧文\ncategory: learn\ndate: 2026-10-10\n---\n\n![图片](./assets/photo.png)';
    const location = articleLocation(f.root, file, input)!;
    const result = await buildPreview({ ...f, location, raw: input, revision: 1, dirty: false });
    expect(result.message.post.id).toMatch(/^legacy-/);
    expect(result.message.post.category).toBe('learn');
    expect(decodeURIComponent(result.message.post.assets['./assets/photo.png'].url)).toContain('archive/assets/photo.png');
    expect(result.message.warnings).toEqual([]);
  });

  it('retains traversal/symlink protection for archives and renders without missing project styles', async () => {
    const f = await fixture(); const file = path.join(f.root, 'saved/生活旁白/2026-10-10/index.md');
    await mkdir(path.join(path.dirname(file), 'assets'), { recursive: true });
    await symlink(path.join(f.root, 'src/styles/site.css'), path.join(path.dirname(file), 'assets/leak.txt'));
    const input = raw('[资源](./assets/leak.txt)\n\n完整正文。');
    const location = articleLocation(f.root, file, input)!;
    await rm(path.join(f.root, 'src/styles'), { recursive: true });
    const result = await buildPreview({ ...f, location, raw: input, revision: 1, dirty: true });
    expect(result.links.size).toBe(0); expect(result.message.styles).toEqual([]);
    expect(result.message.post.body).toContain('完整正文');
    expect(result.message.warnings.some((warning) => warning.includes('符号链接'))).toBe(true);
  });
});
