import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test('provides explicit series order, native previous/next links and a separate article contents', async ({ page }) => {
  await page.goto('/series/learning-notes/');
  await expect(page.locator('.series-order')).toHaveText(['01', '02', '03', '04', '06']);
  await page.locator('.series-chapters a[href="/article/local-markdown/"]').click();
  await expect(page.locator('.article-series')).toContainText('第 02 篇');
  const navigation = page.getByRole('navigation', { name: '系列阅读导航' });
  await expect(navigation.locator('a')).toHaveCount(3);
  expect(await navigation.locator('a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))).toEqual(['/article/learning-rhythm/', '/series/learning-notes/', '/article/reading-notes/']);
  await navigation.locator('a[href="/article/learning-rhythm/"]').click();
  await expect(page.locator('.article-series')).toContainText('第 01 篇');
  await expect(page.getByRole('navigation', { name: '系列阅读导航' }).getByText('← 上一篇')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: '本文目录' })).toBeVisible();
  await page.getByRole('link', { name: '系列目录', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/series\/learning-notes\/$/);
});

test('keeps long series readable across breakpoints, without JavaScript and when printing', async ({ page, browser, baseURL }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/series/long-reading-notes/');
    await expect(page.locator('.series-chapters li')).toHaveCount(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  }
  await page.locator('.series-chapters a').last().click();
  await expect(page.locator('.article-series')).toContainText('第 20 篇');
  await expect(page.getByRole('navigation', { name: '系列阅读导航' }).getByText('下一篇 →')).toHaveCount(0);
  for (const link of await page.locator('.series-navigation a').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.series-navigation')).toBeHidden();
  await expect(page.locator('.article-prose')).toContainText('检查章节目录');
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const target = await context.newPage();
    await target.goto(new URL('/series/learning-notes/', baseURL).href);
    await expect(target.locator('.series-chapters li')).toHaveCount(5);
    await target.locator('.series-chapters a').first().click();
    await expect(target.locator('.article-series')).toContainText('第 01 篇');
    await expect(target.locator('.series-navigation')).toBeVisible();
  } finally { await context.close(); }
});

test('preserves the four page types and real pagination', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('请叫我木头人');
  await expect(page.locator('.cover-bio')).toHaveText('双鱼·INFJ·生活第一，工作第二·想要成为有趣的人。');
  const homeAvatar = page.locator('.avatar-slot--home img');
  await expect(homeAvatar).toBeVisible();
  await expect(homeAvatar).toHaveAttribute('src', /avatar-head\..+\.png$/);

  await page.getByRole('link', { name: '浏览目录' }).click();
  const directoryAvatar = page.locator('.avatar-slot--directory img');
  await expect(directoryAvatar).toBeVisible();
  await expect(directoryAvatar).toHaveAttribute('src', /avatar-head\..+\.png$/);
  await expect(page.locator('.column-title')).toHaveText(['闲暇娱乐', '生活旁白', '蘸豆！！']);
  await expect(page.locator('.featured-entry')).toHaveCount(3);
  await expect(page.locator('.plain-entries li')).toHaveCount(6);

  await page.goto('/category/play/');
  await expect(page.locator('.category-row h2')).toHaveCount(3);
  const firstPage = await page.locator('.category-row h2').allTextContents();
  await page.getByRole('link', { name: '第 2 页' }).click();
  await expect(page).toHaveURL(/\/category\/play\/page\/2\/$/);
  await expect(page.locator('.category-row h2')).toHaveCount(3);
  const secondPage = await page.locator('.category-row h2').allTextContents();
  expect(firstPage).toHaveLength(3);
  expect(secondPage).toHaveLength(3);
  expect(firstPage.some((title) => secondPage.includes(title))).toBe(false);
  const pagination = page.getByRole('navigation', { name: '栏目内容分页' });
  for (const target of [3, 4]) {
    await pagination.getByRole('link', { name: '下一页', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/category/play/page/${target}/$`));
    await expect(pagination.locator('.pagination-track a')).toHaveCount(2);
    await expect(pagination.getByRole('link', { name: `第 ${target} 页`, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await expect(page.locator('.category-row h2')).toHaveCount(1);
  await expect(page.locator('.category-row h2')).toHaveText('分页 Mock 05 · 最后一页的一点留白');
  await expect(pagination.getByRole('link', { name: '下一页', exact: true })).toHaveCount(0);
});

test('keeps category pagination aligned between full and partial pages at every breakpoint', async ({ page }) => {
  const pagination = page.getByRole('navigation', { name: '栏目内容分页' });
  const position = () => pagination.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      top: rect.top + window.scrollY,
      bottom: rect.bottom + window.scrollY,
      tableBottom: document.querySelector('.category-table')!.getBoundingClientRect().bottom + window.scrollY,
      footerTop: document.querySelector('.page-footer')!.getBoundingClientRect().top + window.scrollY,
      pageHeight: document.documentElement.scrollHeight,
    };
  });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/category/play/');
    await expect(page.locator('.category-row')).toHaveCount(3);
    const full = await position();
    await page.goto('/category/play/page/4/');
    await expect(page.locator('.category-row')).toHaveCount(1);
    await expect(pagination.getByRole('link', { name: '第 4 页', exact: true })).toHaveAttribute('aria-current', 'page');
    const partial = await position();
    expect(Math.abs(partial.top - full.top), `${viewport.width}px pagination`).toBeLessThanOrEqual(1);
    expect(Math.abs(partial.pageHeight - full.pageHeight)).toBeLessThanOrEqual(1);
    expect(partial.top - partial.tableBottom).toBeGreaterThanOrEqual(29);
    expect(partial.footerTop - partial.bottom).toBeGreaterThanOrEqual(29);
    // Stress the reserved space with an empty DOM list, without changing fixtures.
    await page.locator('.category-row').last().evaluate((node) => node.remove());
    expect(Math.abs((await position()).top - full.top)).toBeLessThanOrEqual(1);
    await page.goto('/category/play/');
    await expect(page).toHaveURL(/\/category\/play\/$/);
    await expect(page.locator('.category-row')).toHaveCount(3);
  }
});

test('lets long category content grow without overlapping pagination or the footer', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/category/play/page/2/');
  await expect(page.locator('.category-row')).toHaveCount(3);
  // A layout-only stress case; the underlying fixture Markdown is unchanged.
  await page.locator('.category-row h2').first().evaluate((node) => { node.textContent = '这是一段需要完整显示的长文章标题。'.repeat(30); });
  const pagination = page.getByRole('navigation', { name: '栏目内容分页' });
  await expect(pagination).toHaveCSS('position', 'static');
  const layout = await pagination.evaluate((node) => ({
    top: node.getBoundingClientRect().top,
    bottom: node.getBoundingClientRect().bottom,
    lastRowBottom: document.querySelector('.category-row:last-child')!.getBoundingClientRect().bottom,
    footerTop: document.querySelector('.page-footer')!.getBoundingClientRect().top,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(layout.top - layout.lastRowBottom).toBeGreaterThanOrEqual(29);
  expect(layout.footerTop - layout.bottom).toBeGreaterThanOrEqual(29);
  expect(layout.height).toBeGreaterThan(640);
  expect(layout.width).toBeLessThanOrEqual(360);
  await pagination.getByRole('link', { name: '上一页', exact: true }).click();
  await expect(page).toHaveURL(/\/category\/play\/$/);
});

test('uses Pretext for the opted-in desktop block and supports its controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/article/learning-rhythm/');
  await expect(page.locator('.page-top .avatar-slot')).toHaveCount(0);
  const flow = page.locator('.flow-block');
  await expect(flow).toHaveAttribute('data-engine', 'pretext');
  await expect(flow).toHaveAttribute('data-layout', 'wrap');
  await expect(flow.locator('.flow-fragment').first()).toBeVisible();

  const positionsBefore = await flow.locator('.flow-fragment').evaluateAll((nodes) =>
    nodes.map((node) => [(node as HTMLElement).style.left, (node as HTMLElement).style.top]),
  );
  await page.getByRole('button', { name: '开启互动', exact: true }).click();
  const cup = page.getByRole('button', { name: /移动环绕图片/ });
  await cup.focus();
  await cup.press('ArrowRight');
  await cup.press('ArrowDown');
  await expect.poll(() => flow.locator('.flow-fragment').evaluateAll((nodes) =>
    nodes.map((node) => [(node as HTMLElement).style.left, (node as HTMLElement).style.top]),
  )).not.toEqual(positionsBefore);

  await page.getByRole('button', { name: '普通排版' }).click();
  await expect(flow).toHaveAttribute('data-layout', 'inline');
  await expect(flow.locator('.flow-original p')).toHaveCount(3);
  const signature = page.locator('.author-signature');
  const signatureAvatar = signature.locator('.avatar-slot--signature img');
  await expect(signatureAvatar).toBeVisible();
  await expect(signatureAvatar).toHaveAttribute('src', /avatar-half\..+\.png$/);
  await expect(signature.locator('.author-signature-name')).toHaveText('请叫我木头人');
  await expect(signature.locator('.author-signature-bio')).toHaveText('双鱼·INFJ·生活第一，工作第二·想要成为有趣的人。');
});

test('keeps all confirmed viewports free of horizontal overflow', async ({ page }) => {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of ['/', '/contents/', '/category/play/', '/article/learning-rhythm/']) {
      await page.goto(route);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, `${viewport.width}px ${route}`).toBeLessThanOrEqual(viewport.width);
    }
  }
});

test('uses native article anchors with keyboard navigation, history and direct links', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/article/learning-rhythm/');
  await expect(page.locator('.flow-block')).toHaveAttribute('data-engine', 'pretext');
  const links = page.locator('.toc').getByRole('link');
  const headings = page.locator('.article-prose h2');
  await expect(links).toHaveCount(await headings.count());
  const firstHash = `#${encodeURIComponent((await headings.nth(0).getAttribute('id'))!)}`;
  const secondHash = `#${encodeURIComponent((await headings.nth(1).getAttribute('id'))!)}`;
  await expect(links.nth(0)).toHaveAttribute('href', firstHash);
  await expect(links.nth(1)).toHaveAttribute('href', secondHash);

  await links.nth(0).focus();
  await links.nth(0).press('Enter');
  await expect.poll(() => new URL(page.url()).hash).toBe(firstHash);
  await expect(headings.nth(0)).toBeInViewport();
  await expect(links.nth(0)).toHaveAttribute('aria-current', 'location');

  await links.nth(1).click();
  await expect.poll(() => new URL(page.url()).hash).toBe(secondHash);
  await expect(headings.nth(1)).toBeInViewport();
  await expect(links.nth(1)).toHaveAttribute('aria-current', 'location');
  await page.goBack();
  await expect.poll(() => new URL(page.url()).hash).toBe(firstHash);
  await expect(headings.nth(0)).toBeInViewport();
  await page.goForward();
  await expect.poll(() => new URL(page.url()).hash).toBe(secondHash);

  await page.goto(`/article/learning-rhythm/${secondHash}`);
  await expect(headings.nth(1)).toBeInViewport();
  await expect(links.nth(1)).toHaveAttribute('aria-current', 'location');
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
});

test('uses inline article layout and collapsible contents on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 844 });
  await page.goto('/article/learning-rhythm/');
  await expect(page.locator('.flow-block')).toHaveAttribute('data-layout', 'inline');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/article/learning-rhythm/');
  await expect(page.locator('.flow-block')).toHaveAttribute('data-layout', 'inline');
  const details = page.locator('.mobile-toc');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  const link = details.getByRole('link').nth(1);
  const hash = await link.getAttribute('href');
  await link.click();
  await expect.poll(() => new URL(page.url()).hash).toBe(hash);
  await expect(details).not.toHaveAttribute('open', '');
  await expect(page.locator('.article-prose h2').nth(1)).toBeInViewport();
});

test('compresses h1 to h4 into two contents levels on desktop and mobile without changing heading styles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto('/article/reading-notes/');
    const toc = page.locator(width === 1440 ? '.toc' : '.mobile-toc');
    if (width === 390) await toc.locator('summary').click();
    const chapter = toc.getByRole('link', { name: '02 · 留给标题的另一种样式', exact: true });
    const child = toc.getByRole('link', { name: '02.1 · 跳过中间层级的小节', exact: true });
    const sibling = toc.getByRole('link', { name: '02.2 · 并列的小节', exact: true });
    const grandchild = toc.getByRole('link', { name: '02.2.1 · 更细的一点补充', exact: true });
    await expect(chapter.locator('..')).toHaveAttribute('data-toc-level', '0');
    await expect(child.locator('..')).toHaveAttribute('data-toc-level', '1');
    await expect(sibling.locator('..')).toHaveAttribute('data-toc-level', '1');
    await expect(grandchild.locator('..')).toHaveAttribute('data-toc-level', '2');
    await expect(child).toHaveCSS('padding-left', width === 1440 ? '12px' : '16px');
    const bodyHeading = page.locator('.article-prose h4').filter({ hasText: '跳过中间层级的小节' });
    expect(await bodyHeading.evaluate((node) => getComputedStyle(node).fontSize)).toBe(await page.locator('.article-prose h4').first().evaluate((node) => getComputedStyle(node).fontSize));
    const hash = `#${encodeURIComponent((await bodyHeading.getAttribute('id'))!)}`;
    await expect(child).toHaveAttribute('href', hash);
    await child.click();
    await expect.poll(() => new URL(page.url()).hash).toBe(hash);
    await expect(bodyHeading).toBeInViewport();
    if (width === 390) await expect(toc).not.toHaveAttribute('open');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('copies exact code text and newlines on desktop and mobile', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  await page.goto('/article/learning-rhythm/');
  const block = page.locator('.code-block').first();
  const code = block.locator('pre code');
  const expected = await code.textContent();
  expect(expected).toContain('\n\nconsole.log(note.title);\n');
  await expect(code).toHaveClass('language-js hljs');
  await expect(block.locator('pre')).toHaveCSS('padding-top', '58px');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const button = block.getByRole('button', { name: '复制代码', exact: true });
    await button.click();
    await expect(button).toHaveText('已复制');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    expect(await code.textContent()).toBe(expected);
    await expect(block.getByRole('status')).toHaveText('代码已复制。');
  }
  await expect(block.getByRole('button', { name: '复制代码', exact: true })).toHaveText('复制');
});

test('keeps code colors readable under host styles and wide highlighted lines inside the code area', async ({ page }) => {
  await page.goto('/article/learning-rhythm/');
  // VS Code gives code its own theme color instead of inheriting the blog's ink.
  await page.addStyleTag({ content: 'code, a code { color: #e9b662; }' });
  const code = page.locator('.code-block pre code').first();
  await expect(code).toHaveCSS('color', 'rgb(52, 60, 54)');
  await expect(code.locator('.hljs-keyword').first()).toHaveCSS('color', 'rgb(73, 100, 71)');
  await expect(code.locator('.hljs-string').first()).toHaveCSS('color', 'rgb(134, 89, 56)');
  await page.locator('.article-prose').evaluate((prose) => {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = '行内 <code>inline</code> 和 <a href="#main"><code>link</code></a>。';
    paragraph.id = 'code-color-probe';
    const pre = document.createElement('pre');
    const plain = document.createElement('code');
    plain.textContent = '理解工具解决的问题 -> 理解项目的宏观架构\n';
    pre.id = 'plain-code-probe';
    pre.append(plain);
    prose.append(paragraph, pre);
  });
  await expect(page.locator('#plain-code-probe code')).toHaveCSS('color', 'rgb(52, 60, 54)');
  expect(await page.locator('#plain-code-probe code span').count()).toBe(0);
  await expect(page.locator('#code-color-probe > code')).toHaveCSS('color', 'rgb(63, 70, 63)');
  await expect(page.locator('#code-color-probe a code')).toHaveCSS('color', 'rgb(67, 83, 61)');
  await page.setViewportSize({ width: 390, height: 844 });
  await code.locator('.hljs-string').first().evaluate((span) => { span.textContent = `'${'long highlighted string '.repeat(15)}'`; });
  const pre = code.locator('..');
  expect(await pre.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  await pre.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  expect(await pre.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const failure of ['denied', 'unavailable'] as const) {
  test(`keeps code readable and reports clipboard ${failure}`, async ({ page }) => {
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: mode === 'unavailable' ? undefined : { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
      });
    }, failure);
    await page.goto('/article/learning-rhythm/');
    const block = page.locator('.code-block').first();
    const expected = await block.locator('pre code').textContent();
    const button = block.getByRole('button', { name: '复制代码', exact: true });
    await button.click();
    await expect(button).toHaveText('复制失败');
    await expect(block.getByRole('status')).toHaveText('无法复制，请选中代码手动复制。');
    expect(await block.locator('pre code').textContent()).toBe(expected);
    await expect(button).toBeEnabled();
  });
}

test('links every article heading directly without changing the contents IDs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/article/learning-rhythm/');
  const headings = page.locator('.article-prose h2');
  const links = page.locator('.article-prose .heading-link');
  await expect(links).toHaveCount(await headings.count());
  for (let index = 0; index < await headings.count(); index += 1) {
    const id = await headings.nth(index).getAttribute('id');
    const hash = `#${encodeURIComponent(id!)}`;
    await expect(links.nth(index)).toHaveAttribute('href', hash);
    await expect(page.locator('.toc').getByRole('link').nth(index)).toHaveAttribute('href', hash);
  }
  const link = links.nth(1);
  const hash = await link.getAttribute('href');
  await link.press('Enter');
  await expect.poll(() => new URL(page.url()).hash).toBe(hash);
  await expect(headings.nth(1)).toBeInViewport();
  await expect(link).toHaveCSS('opacity', '1');
  await page.reload();
  await expect(headings.nth(1)).toBeInViewport();
});

test('preserves wide and tall image ratios without tea-specific geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const dimensions of [{ width: 600, height: 300 }, { width: 300, height: 900 }]) {
    const bytes = await sharp({ create: { ...dimensions, channels: 4, background: 'green' } }).png().toBuffer();
    await page.route('**/media/**', async (route) => {
      if (route.request().url().endsWith('.webp')) await route.fulfill({ status: 200, contentType: 'image/png', body: bytes });
      else if (route.request().url().endsWith('.json')) await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ height: 2, rows: [[0, 1], [0, 1]] }) });
      else await route.continue();
    });
    await page.goto('/article/learning-rhythm/');
    await expect(page.locator('.flow-block')).toHaveAttribute('data-layout', 'wrap');
    const box = await page.locator('.flow-obstacle').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width / box!.height).toBeCloseTo(dimensions.width / dimensions.height);
    expect(box!.width).toBeCloseTo(205);
    expect(box!.height).toBeCloseTo(205 * dimensions.height / dimensions.width);
    await expect(page.locator('.flow-inline-image')).toHaveAttribute('alt', '一杯茶，作为图文环绕的独立图片');
    await page.unroute('**/media/**');
  }
});

test('retains all DOM paragraphs when the contour fails to load or has invalid data', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const response of [{ status: 404, body: '' }, { status: 200, body: '{"height":1,"rows":[[1,0]]}' }]) {
    await page.route('**/media/**/*.json', (route) => route.fulfill({ ...response, contentType: 'application/json' }));
    await page.goto('/article/learning-rhythm/');
    await expect(page.locator('.flow-block')).toHaveAttribute('data-engine', 'plain-dom');
    await expect(page.locator('.flow-block')).toHaveAttribute('data-layout', 'inline');
    await expect(page.locator('.flow-original p')).toHaveCount(3);
    await expect(page.locator('.flow-original p').last()).toBeVisible();
    await expect(page.getByRole('heading', { name: '给下一次回来留一个入口' })).toBeVisible();
    await page.unroute('**/media/**/*.json');
  }
});

test('keeps the complete original paragraphs readable for printing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/article/learning-rhythm/');
  await expect(page.locator('.flow-block')).toHaveAttribute('data-layout', 'wrap');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.flow-original p')).toHaveCount(3);
  await expect(page.locator('.flow-original p').first()).toBeVisible();
  await expect(page.locator('.flow-visual')).toBeHidden();
  const style = await page.locator('.flow-original').evaluate((node) => getComputedStyle(node).position);
  expect(style).toBe('static');
  await expect(page.locator('.code-copy').first()).toBeHidden();
  await expect(page.locator('.heading-link').first()).toBeHidden();
  await expect(page.locator('.code-block pre code').first()).toBeVisible();
  await expect(page.locator('.code-block .hljs-keyword').first()).toBeVisible();
  await expect(page.locator('.code-block .hljs-keyword').first()).toHaveCSS('color', 'rgb(73, 100, 71)');
  await expect(page.locator('.code-block pre').first()).toHaveCSS('padding-top', '22px');
});

test('renders complete article DOM and working anchors without JavaScript and keeps previews noindex', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(new URL('/article/learning-rhythm/', baseURL).href);
    await expect(page.locator('.flow-original p')).toHaveCount(3);
    await expect(page.locator('.flow-original p').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: '给下一次回来留一个入口' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('.code-copy').first()).toBeHidden();
    await expect(page.locator('.code-block pre code').first()).toContainText('console.log(note.title);');
    await expect(page.locator('.code-block .hljs-keyword').first()).toBeVisible();
    await expect(page.locator('.code-block pre').first()).toHaveCSS('padding-top', '58px');
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(new URL('/article/learning-rhythm/', baseURL).href);
      const toc = page.locator(viewport.width > 900 ? '.toc' : '.mobile-toc');
      if (viewport.width <= 900) await toc.locator('summary').click();
      const link = toc.getByRole('link').nth(1);
      const hash = await link.getAttribute('href');
      await link.click();
      await expect.poll(() => new URL(page.url()).hash).toBe(hash);
      await expect(page.locator('.article-prose h2').nth(1)).toBeInViewport();
      const headingLink = page.locator('.article-prose .heading-link').first();
      const headingHash = await headingLink.getAttribute('href');
      await headingLink.press('Enter');
      await expect.poll(() => new URL(page.url()).hash).toBe(headingHash);
      await expect(page.locator('.article-prose h2').first()).toBeInViewport();
      await page.reload();
      await expect.poll(() => new URL(page.url()).hash).toBe(headingHash);
      await expect(page.locator('.article-prose h2').first()).toBeInViewport();
    }
  } finally { await context.close(); }
});

test('reveals the mounted gallery without preview clicks and restores the original article page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/category/play/page/3/');
  const rope = page.locator('.mutou-rope-handle');
  await expect(rope).toBeVisible();
  const box = (await rope.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 86, { steps: 20 });
  await expect.poll(() => page.locator('.leisure-reveal').getAttribute('data-reveal-progress')).not.toBe('0');
  const forward = Number(await page.locator('.leisure-reveal').getAttribute('data-reveal-progress'));
  await expect(page.locator('.toy-mount')).toHaveCount(7);
  await expect(page.locator('.toy-gallery')).toHaveAttribute('inert', '');
  await page.locator('.toy-cover-button').first().evaluate((node: HTMLButtonElement) => node.click());
  await expect(page.locator('.toy-dialog')).not.toHaveAttribute('open');
  await page.mouse.move(x, y + 35, { steps: 16 });
  await expect.poll(async () => Number(await page.locator('.leisure-reveal').getAttribute('data-reveal-progress'))).toBeLessThan(forward);
  await page.mouse.up();
  await expect(page.locator('.leisure-reveal')).toHaveAttribute('data-reveal-phase', 'idle');
  await rope.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.leisure-reveal')).toHaveAttribute('data-reveal-phase', 'committed');
  await expect(rope).toBeHidden();
  await page.getByRole('button', { name: '返回文章', exact: true }).click();
  await expect(page.locator('.leisure-reveal')).toHaveAttribute('data-reveal-phase', 'idle');
  await expect(rope).toBeFocused();
  await expect(page).toHaveURL(/\/category\/play\/page\/3\/$/);
  await expect(page.getByRole('link', { name: '第 3 页', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('keeps gallery media manual and turns seven works into a three-work tail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/category/play/');
  const rope = page.locator('.mutou-rope-handle');
  await expect(rope).toBeVisible();
  await rope.focus();
  await page.keyboard.press('Enter');
  const first = page.locator('.toy-cover-button').first();
  await first.press('Enter');
  const dialog = page.locator('.toy-dialog'), video = dialog.locator('video');
  await expect(dialog).toHaveAttribute('open', '');
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => Number.isFinite(node.duration))).toBe(true);
  expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
  await expect(page.locator('.wind-scene-art')).toHaveAttribute('data-scene-running', 'false');
  await video.evaluate((node: HTMLVideoElement) => node.play());
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
  expect(await video.evaluate((node: HTMLVideoElement) => node.paused && !node.hasAttribute('src'))).toBe(true);
  await expect(page.locator('.wind-scene-art')).toHaveAttribute('data-scene-running', 'true');
  await page.locator('.toy-cover-button').last().click();
  await expect(dialog.getByText('尚未提供演示视频')).toBeVisible();
  await expect(dialog.locator('a')).toBeHidden();
  await page.getByRole('button', { name: '关闭演示' }).click();
  const firstIds = await page.locator('.toy-mount').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.workId));
  await page.getByRole('button', { name: '再展一卷', exact: true }).click();
  await expect(page.locator('.toy-volume-range')).toHaveText('08—10 / 10');
  await expect(page.locator('.toy-mount')).toHaveCount(3);
  await expect(page.locator('.toy-volume')).toHaveCount(1);
  const nextFirst = page.locator('.toy-cover-button[data-work-id="demo-08"]');
  await expect(nextFirst).toBeFocused();
  const tailIds = await page.locator('.toy-mount').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.workId));
  expect(new Set([...firstIds, ...tailIds]).size).toBe(10);
  await expect(nextFirst.locator('img')).toHaveCSS('object-fit', 'contain');
  await nextFirst.press('Enter');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(dialog.locator('a')).toBeHidden();
  await expect(video).toBeVisible();
  await page.getByRole('button', { name: '关闭演示' }).click();
  await page.getByRole('button', { name: '再展一卷', exact: true }).click();
  await expect(page.locator('.toy-volume-range')).toHaveText('01—07 / 10');
  await expect(page.locator('.toy-mount')).toHaveCount(7);
  await expect(page.getByRole('button', { name: '前卷', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '返回文章', exact: true }).click();
  await expect(rope).toBeFocused();
  expect(await page.evaluate(() => document.body.style.position)).toBe('');
});

test('keeps volume switches atomic through image failure, repeated clicks and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/category/play/');
  const rope = page.locator('.mutou-rope-handle');
  await expect(rope).toBeVisible();
  await rope.focus(); await page.keyboard.press('Enter');
  const gallery = page.locator('.toy-gallery');
  await expect(page.locator('.leisure-reveal-return')).toBeFocused();
  await expect(page.locator('.wind-scene-art')).toHaveAttribute('data-scene-status', 'ready');
  await page.locator('.wind-scene-canvas').evaluate((node: HTMLCanvasElement) => { node.dataset.testIdentity = 'same-scene'; });
  const firstIds = await page.locator('.toy-mount').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.workId));
  await page.route('**/demo-08.webp', (route) => route.abort());
  await page.getByRole('button', { name: '再展一卷', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '下卷未备妥' })).toBeVisible();
  await expect(gallery).toHaveAttribute('data-turn', 'idle');
  await expect(page.locator('.toy-mount')).toHaveCount(7);
  await expect(page.locator('.toy-volume-range')).toHaveText('01—07 / 10');
  await page.unroute('**/demo-08.webp');
  await page.getByRole('button', { name: '再展一卷', exact: true }).click();
  await expect(gallery).toHaveAttribute('data-turn', 'animating');
  await expect(page.locator('.toy-volume')).toHaveCount(2);
  for (const batch of await page.locator('.toy-volume').all()) await expect(batch).toHaveAttribute('inert', '');
  await page.locator('.toy-cover-button').first().evaluate((node: HTMLButtonElement) => node.click());
  await expect(page.locator('.toy-dialog')).not.toHaveAttribute('open');
  await page.locator('.toy-next-volume').evaluate((node: HTMLButtonElement) => { node.click(); node.click(); node.click(); });
  await page.keyboard.press('Escape');
  await expect(gallery).toHaveAttribute('data-turn', 'idle');
  await expect(page.locator('.toy-volume')).toHaveCount(1);
  expect(await page.locator('.toy-mount').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.workId))).toEqual(firstIds);
  const time = Number(await page.locator('.wind-scene-art').getAttribute('data-scene-time'));
  await page.getByRole('button', { name: '再展一卷', exact: true }).click();
  await expect(gallery).toHaveAttribute('data-turn', 'animating');
  await page.locator('.toy-next-volume').evaluate((node: HTMLButtonElement) => { node.click(); node.click(); });
  await expect(page.locator('.toy-volume-range')).toHaveText('08—10 / 10');
  await expect(page.locator('.toy-mount')).toHaveCount(3);
  await expect(page.locator('.wind-scene-canvas')).toHaveAttribute('data-test-identity', 'same-scene');
  expect(Number(await page.locator('.wind-scene-art').getAttribute('data-scene-time'))).toBeGreaterThan(time);
  await expect(page.locator('.toy-next-volume')).toBeFocused();
  await page.getByRole('button', { name: '前卷', exact: true }).click();
  await expect(page.locator('.toy-volume-range')).toHaveText('01—07 / 10');
  await page.getByRole('button', { name: '再展一卷', exact: true }).click();
  await expect(gallery).toHaveAttribute('data-turn', 'animating');
  await page.getByRole('button', { name: '返回文章', exact: true }).click();
  await expect(page.locator('.leisure-reveal')).toHaveAttribute('data-reveal-phase', 'idle');
  await expect(gallery).toHaveAttribute('data-turn', 'idle');
  await expect(page.locator('.toy-mount')).toHaveCount(7);
  await expect(rope).toBeFocused();
});

test('restores mobile cancellation scroll and respects resize and reduced motion during a turn', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/category/play/');
  const rope = page.locator('.mutou-rope-handle');
  await expect(rope).toBeVisible();
  await rope.focus(); await page.keyboard.press('Enter');
  const gallery = page.locator('.toy-gallery');
  await page.locator('.toy-next-volume').scrollIntoViewIfNeeded();
  const saved = await gallery.evaluate((node) => node.scrollTop);
  expect(saved).toBeGreaterThan(0);
  await page.getByRole('button', { name: '再展一卷', exact: true }).click();
  await expect(gallery).toHaveAttribute('data-turn', 'animating');
  await expect.poll(() => gallery.evaluate((node) => node.scrollTop)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(gallery).toHaveAttribute('data-turn', 'idle');
  expect(await gallery.evaluate((node) => node.scrollTop)).toBe(saved);
  await page.getByRole('button', { name: '再展一卷', exact: true }).click();
  await expect(gallery).toHaveAttribute('data-turn', 'animating');
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(gallery).toHaveAttribute('data-turn', 'idle');
  await expect(page.locator('.toy-volume-range')).toHaveText('01—07 / 10');
  await page.getByRole('button', { name: '再展一卷', exact: true }).click();
  await expect(gallery).toHaveAttribute('data-turn', 'animating');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(gallery).toHaveAttribute('data-turn', 'idle');
  await expect(page.locator('.toy-volume-range')).toHaveText('01—07 / 10');
  await page.getByRole('button', { name: '再展一卷', exact: true }).click();
  await expect(page.locator('.toy-volume-range')).toHaveText('08—10 / 10');
  await expect(page.locator('.toy-mount')).toHaveCount(3);
  await expect(page.locator('.toy-volume')).toHaveCount(1);
  await expect(page.locator('.toy-turn-edge').first()).toBeHidden();
  await expect(page.locator('.toy-cover-button[data-work-id="demo-08"]')).toBeFocused();
  expect(await page.locator('.toy-mount').first().evaluate((node) => (node as HTMLElement).style.transform)).toBe('');
  await page.getByRole('button', { name: '返回文章', exact: true }).click();
  await expect(rope).toBeFocused();
});
