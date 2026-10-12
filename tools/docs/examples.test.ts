import path from 'node:path';
import os from 'node:os';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { atomicWrite } from '../../src/lib/blog/files';
import { isContour } from '../../src/lib/flow-geometry';
import { examplesDirectory, exampleDefinitions, generateExampleAssets, loadExamples } from './examples';

const temporary: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('single-source synthetic Markdown teaching previews', () => {
  it('renders custom resources and reading controls through the real blog components', async () => {
    const { examples, css } = await loadExamples();
    expect(Object.keys(examples)).toEqual(exampleDefinitions.map((definition) => definition.id));
    expect(examples.flow.html).toContain('flow-block'); expect(examples.flow.input.flow?.paragraphs).toHaveLength(3);
    expect(examples.flow.input.flow?.spec.contour).toBe('/examples/illustration-contour.json');
    expect(examples['flow-manual'].input.flow?.spec.contour).toBe('/examples/illustration-mask.json');
    expect(examples.image.html).toContain('<figcaption>纸张、茶杯与一片叶子</figcaption>');
    expect(examples['image-reference'].html).toContain('src="/examples/desk.webp"');
    expect(examples.video.html).toContain('<video'); expect(examples.video.html).toContain('controls=""');
    expect(examples.video.html).toContain('preload="metadata"'); expect(examples.video.html).not.toContain('autoplay');
    expect(examples.video.html).toContain('poster="/examples/video-poster.png"');
    expect(examples.media.html).toContain('poster="/examples/poster.png"');
    expect(examples.attachment.html).toContain('href="/examples/notes.txt"');
    expect(examples['article-link'].html.match(/href="\/examples\/article-note.html"/g)).toHaveLength(2);
    expect(examples.reading.html).toContain('class="code-copy"'); expect(examples.reading.html).toContain('class="heading-link"');
    expect(examples.reading.html).toContain('hljs-keyword');
    expect(css).toContain('.article-prose pre code .hljs-keyword');
    expect(examples.reading.html).toContain('<table>'); expect(examples.reading.html).toContain('type="checkbox"');
    expect(examples.reading.html).toContain('\u2003\u2003标题旁的');
    expect(examples.flow.input.flow!.paragraphs[0]).toMatch(/^\u2003\u2003下午/);
    expect(examples.flow.input.flow!.hardLines?.[0]).toHaveLength(2);
    expect(examples.flow.html).toContain('<br/>\u2003\u2003这里没有强调');
    expect(examples.reading.html.replaceAll('<!-- -->', '')).toContain('<br/>\n\u2003\u2003这一行保持紧凑行距');
    expect(examples.cover.html).toContain('featured-entry'); expect(examples.cover.input.cover?.title).toBe('让记录慢下来');
  });
  it('keeps document subpaths isolated from Next public environment variables', async () => {
    vi.stubEnv('NEXT_PUBLIC_BLOG_BASE_PATH', '/unrelated-blog');
    const { examples } = await loadExamples('/handbook/');
    for (const example of Object.values(examples)) {
      expect(example.html).not.toContain('/unrelated-blog');
      expect(example.html).not.toMatch(/(?:src|href|poster)="\/examples\//);
      expect(example.html).not.toContain('/handbook/handbook/');
    }
    expect(examples.flow.input.flow?.spec.contour).toBe('/handbook/examples/illustration-contour.json');
    expect(examples.video.html).toContain('src="/handbook/examples/demo.mp4"');
  });
  it('provides complete ordinary flow paragraphs and code without JavaScript', async () => {
    const { examples } = await loadExamples();
    const ordinaryFlow = examples.flow.html.replaceAll('<br/>', '\n').replaceAll('<!-- -->', '');
    for (const paragraph of examples.flow.input.flow!.paragraphs) expect(ordinaryFlow).toContain(paragraph);
    expect(examples.flow.html).toContain('flow-fallback');
    expect(examples.reading.html).toMatch(/class="code-copy"[^>]*hidden=""[^>]*disabled=""/);
    expect(examples.reading.html.replace(/<[^>]+>/g, '')).toContain('console.log(message);\n');
    const result = JSON.stringify(examples);
    expect(result).not.toContain('.blog-store'); expect(result).not.toContain('avatar-head'); expect(result).not.toContain('avatar-half');
  });
  it('refuses unsupported Markdown and undeclared resource paths in examples', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sachi-doc-examples-')); temporary.push(root);
    await cp(examplesDirectory, root, { recursive: true });
    await atomicWrite(path.join(root, 'image.md'), '![非法引用](../private.png)');
    await expect(loadExamples('/', root)).rejects.toThrow('未声明资源');
    await atomicWrite(path.join(root, 'image.md'), '<script>alert(1)</script>');
    await expect(loadExamples('/', root)).rejects.toThrow('原始 HTML');
  });
  it('generates teaching-only assets and valid automatic/manual contours in an explicit directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sachi-doc-media-')); temporary.push(root);
    await generateExampleAssets(root);
    expect(isContour(JSON.parse(await readFile(path.join(root, 'illustration-contour.json'), 'utf8')))).toBe(true);
    expect(isContour(JSON.parse(await readFile(path.join(root, 'illustration-mask.json'), 'utf8')))).toBe(true);
    expect((await readFile(path.join(root, 'demo.mp4'))).length).toBeGreaterThan(1000);
    expect(await readFile(path.join(root, 'article-note.html'), 'utf8')).toContain('教学目标页');
  });
});
