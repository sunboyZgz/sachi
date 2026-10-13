import { expect, test } from '@playwright/test';

const article = '/article/special-blocks/';

test('fixture home opens the shared special-block specimen with formulas and all code grammars', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('link', { name: '查看特殊块排版样例' }).click();
  await expect(page).toHaveURL(new RegExp(`${article}$`), { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: '特殊块排版样例', exact: true })).toBeVisible();
  await expect(page.locator('.math-block')).toHaveCount(7);
  await expect(page.locator('.math-block .katex-error')).toHaveCount(1);
  await expect(page.locator('.article-prose')).toContainText('公式之后的这句话');
  for (const language of ['js', 'ts', 'py', 'sh', 'json', 'yml', 'html', 'css', 'java', 'go', 'rs']) {
    await expect(page.locator(`code.language-${language}.hljs`).first()).toBeAttached();
  }
  await expect(page.locator('code.language-unregistered-example')).not.toHaveClass(/hljs/);
  const html = page.locator('.code-block').filter({ has: page.locator('code.language-html') });
  const original = await html.locator('code').textContent();
  await html.getByRole('button', { name: '复制代码' }).click();
  await expect(html.getByRole('button', { name: '复制代码' })).toHaveText('已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(original);
  expect(original).toContain('<h2>标题 &amp; 说明</h2>');
  expect(original?.endsWith('\n')).toBe(true);
  await expect(page.locator('.article-prose article.note')).toHaveCount(0);
  await expect(page.locator('.article-prose table').first().locator('th').nth(1)).toHaveCSS('text-align', 'center');
  await expect(page.locator('.article-prose table').first().locator('th').nth(2)).toHaveCSS('text-align', 'right');
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
  test(`special blocks retain local scrolling at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(article);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const block of [page.locator('.math-block').nth(5), page.locator('.table-scroll').last(), page.locator('.code-block').filter({ hasText: 'const longMessage' }).locator('pre')]) {
      await block.scrollIntoViewIfNeeded();
      const size = await block.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth, overflow: getComputedStyle(element).overflowX }));
      expect(size.overflow).toBe('auto');
      // The equation fits the desktop column; wide code scrolls at every size.
      if (viewport.width < 768 || await block.evaluate((element) => element.tagName === 'PRE')) expect(size.scroll).toBeGreaterThan(size.client);
      await block.evaluate((element) => { element.scrollLeft = 120; });
      if (size.scroll > size.client) expect(await block.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    }
    await expect(page.getByRole('checkbox').first()).toBeDisabled();
    await expect(page.locator('.article-prose')).toContainText('这一页的正文到这里结束');
  });
}

test('formula fonts are served locally and special blocks remain readable without JavaScript and when printed', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const fonts: string[] = [];
  page.on('response', (response) => { if (/\.(?:woff2?|ttf)(?:\?|$)/.test(response.url()) && response.ok()) fonts.push(response.url()); });
  await page.goto(`http://127.0.0.1:4176${article}`);
  await expect(page.locator('.katex-html').first()).toBeVisible();
  await expect(page.locator('.katex-mathml').first()).toBeAttached();
  await expect(page.locator('.code-copy').first()).toBeHidden();
  await expect(page.locator('.article-prose .table-scroll')).toHaveCount(2);
  await expect(page.locator('.article-prose')).toContainText('这一页的正文到这里结束');
  await expect.poll(() => fonts.length).toBeGreaterThan(0);
  expect(fonts.every((url) => new URL(url).origin === 'http://127.0.0.1:4176')).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.katex-html').first()).toBeVisible();
  await expect(page.locator('.math-block').first()).toHaveCSS('overflow-x', 'visible');
  await expect(page.locator('.article-prose table').first()).toBeVisible();
  await expect(page.locator('code.language-js').first()).toBeVisible();
  await context.close();
});
