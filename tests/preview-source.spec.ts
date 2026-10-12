import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { postFromDocument } from '../src/lib/blog/document';
import { createSourceMapper } from '../src/lib/source-text-map';
import type { PreviewData, RevealSource, ViewMessage } from '../tools/vscode-preview/src/protocol';

let files: Map<string, Uint8Array>;
test.beforeAll(async () => {
  const bundle = await build({ entryPoints: ['tools/vscode-preview/src/webview.tsx'], bundle: true, write: false, outdir: '/tmp/sachi-preview-browser-tests', platform: 'browser', format: 'iife', target: 'chrome120', jsx: 'automatic', tsconfig: 'tsconfig.json', loader: { '.png': 'file' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_BLOG_BASE_PATH': '""', 'process.env.NEXT_PUBLIC_BLOG_ASSET_PREFIX': '""' } });
  files = new Map(bundle.outputFiles.map((file) => [path.basename(file.path), file.contents]));
});

const body = '## 正文标题\n\n::   重复 &#x1f600; &amp; \\*文字。\n\n第二段重复 **强调重复** 与 `行内代码`。\n\n- 列表正文\n\n> 引用正文\n\n| 列 |\n| --- |\n| 表格正文 |\n\n> ```ts\n> const nestedToken = 2;\n> ```\n\n[外部链接](https://example.org/)';
function data(markdown = body): PreviewData {
  return { type: 'update', revision: 1, document: '/temporary/content/闲暇娱乐/2026-10-10/index.md', dirty: true,
    post: postFromDocument('闲暇娱乐/2026-10-10/index.md', { id: 'e49d7574-ea58-4e66-8762-79bfcc1c2a74', title: '文章标题', createdAt: '2026-10-10T09:00:00+08:00' }, markdown, 'Asia/Shanghai'),
    profile: { name: '测试作者', signature: '测试签名', bio: '测试简介', homeLabel: '测试博客', copyrightStartYear: 2026, authorUrl: null, sameAs: [], seo: { description: null, allowIndexing: false } }, warnings: [], styles: [], avatar: '/test-preview/shape.svg', source: { origin: { lineOffset: 6 }, version: 3, totalLines: markdown.split('\n').length + 6, syncEnabled: true, clickEnabled: true, title: { line: 3, column: 1 } } };
}
async function mount(page: Page, message = data()) {
  await page.addInitScript(() => {
    const messages: unknown[] = [];
    Object.assign(window, { __previewMessages: messages, acquireVsCodeApi: () => ({
      getState: () => undefined, setState: () => {}, postMessage: (message: { type: string }) => {
        messages.push(message);
        if (message.type === 'revealSource') window.dispatchEvent(new MessageEvent('message', { data: { type: 'sourceResult', receipt: { ...message, accepted: true, navigationSequence: 0 } } }));
      },
    }) });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
  });
  await page.route('**/test-preview/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    if (name === '') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="webview.css"></head><body><div id="root"></div><script src="webview.js"></script></body></html>' });
    if (name === 'shape.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#596b50"/></svg>' });
    if (name === 'contour.json') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ height: 120, rows: Array.from({ length: 120 }, () => [0, 1]) }) });
    const file = files.get(name);
    return file ? route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'image/png', body: Buffer.from(file) }) : route.abort();
  });
  await page.goto('/test-preview/');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __previewMessages: ViewMessage[] }).__previewMessages.some((message) => message.type === 'ready'))).toBe(true);
  await page.evaluate((message) => window.dispatchEvent(new MessageEvent('message', { data: message })), message);
  await expect(page.locator('.article-title')).toHaveText('文章标题');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __previewMessages: ViewMessage[] }).__previewMessages.some((message) => message.type === 'rendered'))).toBe(true);
}
async function requests(page: Page) {
  return page.evaluate(() => (window as unknown as { __previewMessages: ViewMessage[] }).__previewMessages.filter((message): message is RevealSource => message.type === 'revealSource'));
}
async function coordinates(page: Page, text: string, selector = '.article-prose', offset = 0) {
  return page.locator(selector).first().evaluate((scope, { text, offset }) => {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const index = node.textContent?.indexOf(text) ?? -1;
      if (index < 0 || node.parentElement?.closest('.flow-block[data-layout="wrap"] .flow-original')) continue;
      node.parentElement!.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const range = document.createRange();
      range.setStart(node, index + offset); range.setEnd(node, index + offset + 1);
      const rect = range.getClientRects()[0];
      if (rect?.width) return { x: rect.left + Math.min(1, rect.width * .2), y: rect.top + rect.height * .5 };
    }
    throw new Error(`Visible text not found: ${text}`);
  }, { text, offset });
}

for (const [text, raw] of [['正文标题', '正文标题'], ['😀', '&#x1f600;'], ['&', '&amp;'], ['*文字', '\\*文字'], ['第二段重复', '第二段重复'], ['强调重复', '强调重复'], ['行内代码', '行内代码'], ['列表正文', '列表正文'], ['引用正文', '引用正文'], ['表格正文', '表格正文'], ['nestedToken', 'nestedToken']]) {
  test(`preview single click maps ${text} to its exact source`, async ({ page }) => {
    await mount(page);
    const hit = await coordinates(page, text);
    await page.mouse.click(hit.x, hit.y);
    await expect.poll(() => requests(page)).toHaveLength(1);
    const point = createSourceMapper(body, { lineOffset: 6 }).point(body.indexOf(raw));
    expect((await requests(page))[0]).toMatchObject({ ...point, version: 3, revision: 1 });
  });
}

test('preview title links to frontmatter while metadata, margins and controls keep their behavior', async ({ page }) => {
  await mount(page);
  await page.locator('.meta time').click();
  await page.locator('.code-copy').first().click();
  await expect(page.locator('.code-copy').first()).toHaveText('已复制');
  await page.getByRole('link', { name: '外部链接' }).click();
  const point = await page.locator('.article-prose p').first().boundingBox();
  await page.mouse.click(point!.x - 10, point!.y + 10);
  expect(await requests(page)).toHaveLength(0);
  const hit = await coordinates(page, '文章标题', '.article-title');
  await page.mouse.click(hit.x, hit.y);
  await expect.poll(() => requests(page)).toHaveLength(1);
  expect((await requests(page))[0]).toMatchObject({ line: 3, column: 1 });
});

test('preview drag selection, right clicks and disabling navigation preserve reading', async ({ page }) => {
  await mount(page);
  const hit = await coordinates(page, '第二段重复');
  await page.mouse.move(hit.x, hit.y); await page.mouse.down(); await page.mouse.move(hit.x + 70, hit.y, { steps: 6 }); await page.mouse.up();
  expect(await page.evaluate(() => document.getSelection()?.isCollapsed)).toBe(false);
  await page.mouse.click(hit.x, hit.y, { button: 'right' });
  expect(await requests(page)).toHaveLength(0);
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'sync', enabled: false, clickEnabled: false } })));
  await page.mouse.click(hit.x, hit.y);
  expect(await requests(page)).toHaveLength(0);
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'sync', enabled: false, clickEnabled: true } })));
  await page.mouse.click(hit.x, hit.y);
  await expect.poll(() => requests(page)).toHaveLength(1);
});

test('invalid metadata disables stale preview clicks until a new render arrives', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'error', revision: 2, message: 'Invalid YAML' } })));
  const hit = await coordinates(page, '第二段重复');
  await page.mouse.click(hit.x, hit.y);
  expect(await requests(page)).toHaveLength(0);
  const fresh = { ...data(), revision: 3, source: { ...data().source, version: 4 } };
  await page.evaluate((message) => window.dispatchEvent(new MessageEvent('message', { data: message })), fresh);
  await expect(page.locator('#preview-error')).toHaveCount(0);
  const next = await coordinates(page, '第二段重复');
  await page.mouse.click(next.x, next.y);
  await expect.poll(() => requests(page)).toHaveLength(1);
  expect((await requests(page))[0]).toMatchObject({ version: 4, revision: 3 });
});

test('flow visual fragments and narrow-screen fallback map to the same source', async ({ page }) => {
  const markdown = '::  环绕 &amp; 中文\n软行重复。\n\n![测试](./assets/shape.svg)\n\n## 后续\n\n正文。';
  const message = data(markdown);
  message.post.assets = { './assets/shape.svg': { type: 'image', url: '/test-preview/shape.svg', width: 160, height: 120 } };
  message.post.flow = { image: '/test-preview/shape.svg', contour: '/test-preview/contour.json', defaultX: .53, defaultY: 86 };
  await mount(page, message);
  await expect(page.locator('.flow-block')).toHaveAttribute('data-layout', 'wrap');
  const hit = await coordinates(page, '软行重复', '.flow-visual');
  await page.mouse.click(hit.x, hit.y);
  await expect.poll(() => requests(page)).toHaveLength(1);
  const point = createSourceMapper(markdown, { lineOffset: 6 }).point(markdown.indexOf('软行重复'));
  expect((await requests(page))[0]).toMatchObject(point);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.flow-block')).toHaveAttribute('data-layout', 'inline');
  const narrow = await coordinates(page, '软行重复', '.flow-original');
  await page.mouse.click(narrow.x, narrow.y);
  await expect.poll(() => requests(page)).toHaveLength(2);
  expect((await requests(page))[1]).toMatchObject(point);
  const failed = { ...message, revision: 2, post: { ...message.post, flow: { ...message.post.flow!, contour: '/test-preview/missing.json' } } };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate((message) => window.dispatchEvent(new MessageEvent('message', { data: message })), failed);
  await expect(page.locator('.flow-block')).toHaveAttribute('data-layout', 'inline');
  const fallback = await coordinates(page, '软行重复', '.flow-original');
  await page.mouse.click(fallback.x, fallback.y);
  await expect.poll(() => requests(page)).toHaveLength(3);
  expect((await requests(page))[2]).toMatchObject(point);
});

test('horizontally scrolled highlighted code retains its original source column', async ({ page }) => {
  const markdown = `\`\`\`ts\n${'leftToken; '.repeat(100)}tailFunction();\n\`\`\``;
  await mount(page, data(markdown));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('pre').evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  const hit = await coordinates(page, 'tailFunction', 'pre code');
  await page.mouse.click(hit.x, hit.y);
  await expect.poll(() => requests(page)).toHaveLength(1);
  expect((await requests(page))[0]).toMatchObject(createSourceMapper(markdown, { lineOffset: 6 }).point(markdown.indexOf('tailFunction')));
});
