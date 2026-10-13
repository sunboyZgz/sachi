import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

const prefix = 'sachi:flow-position:v1:';
async function memories(page: Page) {
  return page.evaluate((prefix) => Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith(prefix)).map((key) => [key, JSON.parse(localStorage.getItem(key)!)])), prefix);
}
async function position(page: Page, index = 0) {
  return page.locator('.flow-block').nth(index).evaluate((block) => {
    const canvas = block.querySelector<HTMLElement>('.flow-canvas')!;
    const image = block.querySelector<HTMLElement>('.flow-obstacle')!;
    const stage = canvas.getBoundingClientRect(), rect = image.getBoundingClientRect();
    return { x: rect.left - stage.left, y: rect.top - stage.top, width: canvas.clientWidth, imageWidth: rect.width, xRatio: (rect.left - stage.left) / (canvas.clientWidth - rect.width) };
  });
}
async function wrap(page: Page, count = 1) {
  await expect(page.locator('.flow-block')).toHaveCount(count);
  for (let index = 0; index < count; index++) await expect(page.locator('.flow-block').nth(index)).toHaveAttribute('data-layout', 'wrap');
}
async function enable(page: Page, index = 0) {
  const button = page.locator('.flow-block').nth(index).getByRole('button', { name: '开启互动', exact: true });
  if (await button.count()) await button.click();
}
async function keyboardMove(page: Page, index = 0) {
  await enable(page, index);
  const before = await position(page, index);
  const image = page.locator('.flow-block').nth(index).locator('button.flow-obstacle');
  await image.press('ArrowRight');
  await image.press('ArrowDown');
  await expect.poll(async () => (await position(page, index)).x).toBeCloseTo(before.x + 12);
  await expect.poll(async () => (await position(page, index)).y).toBeCloseTo(before.y + 12);
}

test('blog remembers a real pointer drag across reload, navigation, width changes and mobile fallback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/article/learning-rhythm/');
  await wrap(page);
  await expect(page.locator('.flow-status')).toHaveCount(0);
  const defaults = await position(page);
  await enable(page);
  const image = page.locator('button.flow-obstacle');
  await image.scrollIntoViewIfNeeded();
  const rect = (await image.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 80, rect.y + rect.height / 2 + 44, { steps: 8 });
  // Dragging itself does not continually write browser storage.
  expect(await memories(page)).toEqual({});
  await page.mouse.up();
  await expect.poll(async () => Object.keys(await memories(page)).length).toBe(1);
  const moved = await position(page);
  expect(moved.x).toBeCloseTo(defaults.x + 80);
  expect(moved.y).toBeCloseTo(defaults.y + 44);
  const saved = await memories(page);
  await page.reload();
  await wrap(page);
  const restored = await position(page);
  expect(restored.x).toBeCloseTo(moved.x);
  expect(restored.y).toBeCloseTo(moved.y);
  await expect(page.getByRole('button', { name: '开启互动', exact: true })).toBeVisible();
  await page.goto('/article/reading-notes/');
  await page.goto('/article/learning-rhythm/');
  await wrap(page);
  expect((await position(page)).x).toBeCloseTo(moved.x);
  await page.setViewportSize({ width: 1024, height: 768 });
  await wrap(page);
  await expect.poll(async () => (await position(page)).xRatio).toBeCloseTo(moved.xRatio);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.flow-block')).toHaveAttribute('data-layout', 'inline');
  expect(await memories(page)).toEqual(saved);
  await page.reload();
  await expect(page.locator('.flow-block')).toHaveAttribute('data-layout', 'inline');
  expect(await memories(page)).toEqual(saved);
  await page.setViewportSize({ width: 1440, height: 900 });
  await wrap(page);
  expect((await position(page)).x).toBeCloseTo(moved.x);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.flow-original p')).toHaveCount(3);
  await expect(page.locator('.flow-original p').first()).toBeVisible();
  expect(await memories(page)).toEqual(saved);
});

test('keyboard movement is remembered and resetting clears only the reader position', async ({ page }) => {
  await page.goto('/article/learning-rhythm/');
  await wrap(page);
  const defaults = await position(page);
  await keyboardMove(page);
  await expect.poll(async () => (await position(page)).x).toBeCloseTo(defaults.x + 12);
  const saved = await position(page);
  await page.reload();
  await wrap(page);
  expect((await position(page)).x).toBeCloseTo(saved.x);
  expect((await position(page)).y).toBeCloseTo(saved.y);
  await page.getByRole('button', { name: '还原位置', exact: true }).click();
  expect(await memories(page)).toEqual({});
  await expect.poll(async () => (await position(page)).x).toBeCloseTo(defaults.x);
  await page.reload();
  await wrap(page);
  expect((await position(page)).y).toBeCloseTo(defaults.y);
  expect(await memories(page)).toEqual({});
});

// Isolated teaching data exercises the public reading renderer without changing the fixture catalogue.
let files: Map<string, Uint8Array>;
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import {createElement} from 'react'; import {createRoot} from 'react-dom/client'; import {ArticleProse} from './src/components/ArticleProse'; import {parseMarkdown} from './src/lib/markdown'; import './src/styles/tokens.css'; import './src/styles/site.css';
      const root=createRoot(document.getElementById('root')); window.addEventListener('message', event=>{if(event.data?.type!=='reading')return; const data=event.data; const assets={'./assets/shape.svg':{type:'image',url:'/test-flow-memory/shape.svg'+(data.imageVersion??''),contour:'/test-flow-memory/contour.json',width:160,height:120}};
      const flow={image:'./assets/shape.svg',width:data.width??180,defaultX:data.defaultX??.53,defaultY:20}; const parsed=parseMarkdown((data.prefix?data.prefix+'\\n\\n':'')+'第一处正文。\\n\\n![甲](./assets/shape.svg)\\n\\n#### 另一个区域\\n\\n第二处正文。\\n\\n![乙](./assets/shape.svg)',flow,assets);
      root.render(createElement('div',{'data-reading':JSON.stringify(data)},createElement(ArticleProse,{parsed,assets,flowKey:data.article})));});`, resolveDir: process.cwd(), sourcefile: 'flow-memory-test.ts' },
    bundle: true, write: false, outdir: '/tmp/sachi-flow-memory-browser-tests', platform: 'browser', format: 'iife', target: 'chrome120', jsx: 'automatic', tsconfig: 'tsconfig.json',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_BLOG_BASE_PATH': '""' },
  });
  files = new Map(result.outputFiles.map((file) => [path.basename(file.path), file.contents]));
});
type Reading = { article: string; width?: number; defaultX?: number; imageVersion?: string; prefix?: string };
async function reading(page: Page, options: Reading) {
  await page.evaluate((options) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'reading', ...options } })), options);
  await expect(page.locator('#root > div')).toHaveAttribute('data-reading', JSON.stringify({ type: 'reading', ...options }));
  await wrap(page, 2);
}
async function mountReading(page: Page, options: Reading = { article: 'article-a' }) {
  await page.route('**/test-flow-memory/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    if (!name) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="stdin.css"></head><body><main id="root" style="width:min(720px,calc(100% - 48px));margin:40px auto"></main><script src="stdin.js"></script></body></html>' });
    if (name === 'shape.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#596b50"/></svg>' });
    if (name === 'contour.json') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ height: 2, rows: [[0, 1], [0, 1]] }) });
    const file = files.get(name);
    return file ? route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', body: Buffer.from(file) }) : route.abort();
  });
  await page.goto('/test-flow-memory/');
  await reading(page, options);
}

test('articles and repeated-image regions retain independent positions and resets', async ({ page }) => {
  await mountReading(page);
  const defaults = [await position(page, 0), await position(page, 1)];
  await keyboardMove(page, 0);
  await keyboardMove(page, 1);
  await page.locator('.flow-block').last().locator('button.flow-obstacle').press('ArrowDown');
  const moved = [await position(page, 0), await position(page, 1)];
  expect(Object.keys(await memories(page))).toHaveLength(2);
  await reading(page, { article: 'article-b' });
  for (let index = 0; index < 2; index++) expect((await position(page, index)).y).toBeCloseTo(defaults[index].y);
  await keyboardMove(page, 0);
  expect(Object.keys(await memories(page))).toHaveLength(3);
  await reading(page, { article: 'article-a' });
  for (let index = 0; index < 2; index++) expect((await position(page, index)).y).toBeCloseTo(moved[index].y);
  await page.locator('.flow-block').first().getByRole('button', { name: '还原位置', exact: true }).click();
  expect(Object.keys(await memories(page))).toHaveLength(2);
  expect((await position(page, 1)).y).toBeCloseTo(moved[1].y);
});

test('changed image or defaults invalidate reader positions while body updates preserve them', async ({ page }) => {
  await mountReading(page);
  const defaults = await position(page);
  await keyboardMove(page);
  await reading(page, { article: 'article-a', prefix: '新加入的一段正文。' });
  await expect(page.locator('.flow-original').first()).toContainText('新加入的一段正文。');
  await expect.poll(async () => (await position(page)).y).toBeCloseTo(defaults.y + 12);
  for (const options of [{ article: 'article-a', width: 240 }, { article: 'article-a', width: 240, defaultX: .4 }, { article: 'article-a', width: 240, defaultX: .4, imageVersion: '?v=2' }]) {
    await reading(page, options);
    await expect.poll(async () => (await position(page)).imageWidth).toBe(options.width);
    await expect.poll(async () => (await position(page)).y).toBeCloseTo(20);
    expect(await memories(page)).toEqual({});
    await keyboardMove(page);
  }
});

test('corrupt or unavailable browser storage preserves a complete working article', async ({ page }) => {
  await mountReading(page);
  const defaults = await position(page);
  await keyboardMove(page);
  const key = Object.keys(await memories(page))[0];
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), key);
  await page.reload();
  await reading(page, { article: 'article-a' });
  expect((await position(page)).x).toBeCloseTo(defaults.x);
  expect(await memories(page)).toEqual({});
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('disabled', 'SecurityError'); } }));
  await page.reload();
  await reading(page, { article: 'article-a' });
  await keyboardMove(page);
  await expect.poll(async () => (await position(page)).y).toBeCloseTo(defaults.y + 12);
  await page.locator('.flow-block').first().getByRole('button', { name: '还原位置', exact: true }).click();
  await expect.poll(async () => (await position(page)).y).toBeCloseTo(defaults.y);
  await expect(page.locator('.flow-original')).toContainText(['第一处正文。', '第二处正文。']);
});
