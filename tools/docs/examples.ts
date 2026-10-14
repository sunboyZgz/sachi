import { chmod, cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { parse } from 'yaml';
import sharp from 'sharp';
import { atomicWrite, exists, writeJson } from '../../src/lib/blog/files';
import { articleTypeSchema, flowSchema, flowSpecs, type Asset } from '../../src/lib/blog/schema';
import { createImageContour } from '../../src/lib/blog/flow-assets';
import { markdownReferences, splitDocument } from '../../src/lib/blog/content';
import { parseMarkdown } from '../../src/lib/markdown';
import { ExampleReading } from '../../docs-site/.vitepress/ExampleReading';
import type { BlogExample, BlogExampleInput } from '../../docs-site/.vitepress/example-types';
import { run } from '../blog-cli/process';

const project = fileURLToPath(new URL('../../', import.meta.url));
const katexDirectory = path.join(project, 'node_modules/katex/dist');
export const examplesDirectory = path.join(project, 'docs-site/.vitepress/examples');
export const exampleDefinitions = [
  { id: 'text-size', title: '行内放大、缩小与自定义倍数', page: 'writing/text-size.md', height: 470 },
  { id: 'poem', title: '诗歌逐行换行与居中', page: 'writing/poetry.md', height: 450 },
  { id: 'flow', title: '透明图片自动环绕', page: 'writing/flow.md', height: 780 },
  { id: 'flow-multiple', title: '正文多图自动识别', page: 'writing/flow.md', height: 1200 },
  { id: 'flow-manual', title: '手工轮廓环绕', page: 'writing/flow.md', height: 650 },
  { id: 'image', title: '正文图片与图片说明', page: 'writing/images.md', height: 500 },
  { id: 'image-reference', title: '引用式图片', page: 'writing/images.md', height: 500 },
  { id: 'cover', title: '封面与栏目重点条目', page: 'writing/images.md', height: 250 },
  { id: 'video', title: 'Markdown 转为原生视频', page: 'writing/video.md', height: 520 },
  { id: 'attachment', title: '附件链接', page: 'writing/attachments.md', height: 180 },
  { id: 'article-link', title: '文章 ID 与固定地址链接', page: 'writing/links.md', height: 300 },
  { id: 'reading', title: '标题链接、代码复制与 GFM', page: 'reference/content.md', height: 660 },
  { id: 'media', title: '图片转换与指定视频封面', page: 'setup/media.md', height: 880 },
] as const;

export function exampleAssets(base = '/'): Record<string, Asset> {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('文档示例 base 无效。');
  const url = (name: string) => `${base}examples/${name}`;
  return {
    './assets/illustration.png': { url: url('illustration.png'), type: 'image', width: 300, height: 270, contour: url('illustration-contour.json') },
    './assets/illustration-mask.json': { url: url('illustration-mask.json'), type: 'file' },
    './assets/desk.png': { url: url('desk.webp'), type: 'image', width: 640, height: 360, contour: url('desk-contour.json'), srcSet: `${url('desk-320.webp')} 320w, ${url('desk.webp')} 640w` },
    './assets/demo.mp4': { url: url('demo.mp4'), type: 'video', poster: url('video-poster.png') },
    './assets/notes.txt': { url: url('notes.txt'), type: 'file' },
    'blog:51f3e126-f6a0-4ef3-a4fb-6dca72b85afd': { url: url('article-note.html'), type: 'file' },
    '/article/slow-notes/': { url: url('article-note.html'), type: 'file' },
  };
}

export async function loadExamples(base = '/', sources = examplesDirectory) {
  const assets = exampleAssets(base);
  const examples: Record<string, BlogExample> = {};
  for (const definition of exampleDefinitions) {
    const source = await readFile(path.join(sources, `${definition.id}.md`), 'utf8');
    const { data, bodyRaw } = /^---\r?\n/.test(source) ? splitDocument(source) : { data: {} as Record<string, unknown>, bodyRaw: source };
    for (const url of markdownReferences(bodyRaw)) if (!url.startsWith('#') && !assets[url]) throw new Error(`教学示例包含未声明资源或文章：${definition.id} → ${url}`);
    const mapping = structuredClone(assets);
    if (definition.id === 'media') mapping['./assets/demo.mp4'].poster = `${base}examples/poster.png`;
    const rawFlow = data.flow ? flowSchema.parse(data.flow) : undefined;
    if (flowSpecs(rawFlow).some((spec) => !mapping[spec.image] || spec.contour && !mapping[spec.contour])) throw new Error(`环绕教学资源未声明：${definition.id}`);
    const type = data.type === undefined ? undefined : articleTypeSchema.parse(data.type);
    const parsed = parseMarkdown(bodyRaw.trim(), rawFlow, mapping, undefined, { type });
    const input: BlogExampleInput = { markdown: parsed.markdown, assets: mapping, flow: parsed.flow, flows: parsed.flows, flowWidths: parsed.flowWidths };
    if (type === 'poem') { input.type = type; input.title = String(data.title); }
    if (definition.id === 'cover') {
      if (typeof data.title !== 'string' || typeof data.cover !== 'string' || data.featured !== true || mapping[data.cover]?.type !== 'image') throw new Error('封面教学元数据无效。');
      input.cover = { title: data.title, image: mapping[data.cover].url, url: `${base}examples/article-note.html` };
    }
    examples[definition.id] = { id: definition.id, title: definition.title, source, input, html: renderToString(createElement(ExampleReading, { input })), expectedHeight: definition.height };
  }
  const katexCss = (await readFile(path.join(katexDirectory, 'katex.min.css'), 'utf8')).replaceAll('url(fonts/', `url(${base}examples/katex/`);
  const css = [katexCss, ...(await Promise.all(['tokens.css', 'site.css', 'code-highlight.css', 'math.css'].map((file) => readFile(path.join(project, 'src/styles', file), 'utf8'))))].join('\n');
  return { examples, css };
}

/** Only synthetic documentation assets. This function never scans content or a blog store. */
export async function generateExampleAssets(destination = path.join(project, 'docs-site/public/examples')) {
  await mkdir(destination, { recursive: true });
  await cp(path.join(katexDirectory, 'fonts'), path.join(destination, 'katex'), { recursive: true });
  const illustration = await sharp(await readFile(path.join(examplesDirectory, 'illustration.svg'))).png().toBuffer();
  await atomicWrite(path.join(destination, 'illustration.png'), illustration);
  await writeJson(path.join(destination, 'illustration-contour.json'), await createImageContour(illustration));
  await atomicWrite(path.join(destination, 'illustration-mask.json'), await readFile(path.join(examplesDirectory, 'illustration-mask.json')));
  const desk = await readFile(path.join(examplesDirectory, 'desk.svg'));
  const deskImage = await sharp(desk).removeAlpha().png().toBuffer();
  await atomicWrite(path.join(destination, 'desk.png'), deskImage);
  await writeJson(path.join(destination, 'desk-contour.json'), await createImageContour(deskImage));
  for (const width of [320, 640]) await atomicWrite(path.join(destination, width === 640 ? 'desk.webp' : 'desk-320.webp'), await sharp(desk).resize(width).webp({ quality: 85 }).toBuffer());
  await atomicWrite(path.join(destination, 'notes.txt'), 'Sachi Blog · 文档教学附件\n\n这份文件只用于演示附件链接，不来自任何真实文章或发布快照。\n');
  await atomicWrite(path.join(destination, 'article-note.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>让记录慢下来 · 教学目标页</title><style>body{max-width:40rem;margin:3rem auto;padding:0 1.5rem;background:#faf8f2;color:#343a34;font:18px/1.9 serif}small{color:#626d60}a{color:#43533d}</style><small>文档教学目标页 · 不是真实博客文章</small><h1>让记录慢下来</h1><p>这是文档中的示例文章。正式博客会把 blog:ID 解析为公开清单里的 /article/slug/，而不会发布未选草稿。</p><p><a href="../writing/links.html" target="_parent">返回文章链接教程 →</a></p></html>');
  const video = path.join(destination, 'demo.mp4');
  if (!await exists(video)) await run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=12:duration=4', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], { cwd: project, code: 3 });
  if (!await exists(path.join(destination, 'video-poster.png'))) await run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', video, '-frames:v', '1', path.join(destination, 'video-poster.png')], { cwd: project, code: 3 });
  await atomicWrite(path.join(destination, 'poster.png'), await sharp(desk).png().toBuffer());
  // The downloadable assets use the same names as the source snippets.
  const settings = parse(await readFile(path.join(examplesDirectory, 'media.yaml'), 'utf8'));
  if (settings.assets['./assets/desk.png'].preset !== 'photo') throw new Error('教学媒体预设与生成规则不同步。');
  for (const file of ['illustration.png', 'illustration-contour.json', 'illustration-mask.json', 'desk.png', 'desk-contour.json', 'desk.webp', 'desk-320.webp', 'demo.mp4', 'video-poster.png', 'poster.png', 'notes.txt', 'article-note.html']) await chmod(path.join(destination, file), 0o644);
  return destination;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generateExampleAssets().then((directory) => console.log(`教学素材已生成：${directory}（不读取博客内容、快照或头像）`)).catch((error) => { console.error(error); process.exitCode = 2; });
