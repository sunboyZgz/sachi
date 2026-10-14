import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { inspectArticleStyles } from './src/style-audit';
import { splitDocument } from '../../src/lib/blog/document';

const root = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), 'sachi-extension-'));
const listener = createServer();
await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = (listener.address() as AddressInfo).port;
await new Promise<void>((resolve) => listener.close(() => resolve()));
const baselineUrl = `http://127.0.0.1:${port}/article/reading-notes/`;
// Capture the real Next.js article before opening VS Code; neither renderer is mocked.
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], { cwd: root, env: { ...process.env, INCLUDE_FIXTURES: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });
try {
  const workspace = path.join(temporary, 'workspace');
  for (const directory of ['src/styles', 'src/config', 'src/assets/avatar', 'content/闲暇娱乐/2026-10-10/assets', 'content/生活旁白/2026-10-10/assets']) await mkdir(path.join(workspace, directory), { recursive: true });
  for (const file of ['src/styles/tokens.css', 'src/styles/site.css', 'src/styles/code-highlight.css', 'src/styles/math.css', 'src/config/profile.json', 'src/assets/avatar/avatar-half.png']) await copyFile(path.join(root, file), path.join(workspace, file));
  await writeFile(path.join(workspace, 'package.json'), '{"name":"sachi-blog","private":true}');
  const article = (title: string, body: string) => `---\nid: ${randomUUID()}\ntitle: ${title}\ncreatedAt: "2026-10-10T09:00:00+08:00"\n---\n\n${body}\n`;
  const parity = splitDocument(await readFile(path.join(root, 'tests/fixtures/content/reading-notes.md'), 'utf8'));
  await writeFile(path.join(workspace, 'rendering-parity.md'), article('排版一致性验收', parity.body.replaceAll('./assets/tea-cup.webp', './assets/shape.png')));
  const deadline = Date.now() + 60_000;
  while (true) {
    try { if ((await fetch(baselineUrl, { signal: AbortSignal.timeout(10_000) })).ok) break; } catch { /* Wait for Next's first compilation. */ }
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Website baseline unavailable: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const baseline = {} as Record<string, ReturnType<typeof inspectArticleStyles>>;
    for (const [mode, width] of [['desktop', 1440], ['mobile', 390]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(baselineUrl);
      await page.locator('.article-prose blockquote em').waitFor();
      baseline[mode] = await page.evaluate(inspectArticleStyles);
    }
    await writeFile(path.join(workspace, 'rendering-styles.json'), JSON.stringify(baseline));
    console.log('PASS actual website desktop/mobile style baselines');
  } finally { await browser.close(); }
  server.kill('SIGTERM');
  await new Promise<void>((resolve) => { if (server.exitCode !== null) resolve(); else server.once('exit', () => resolve()); });
  await writeFile(path.join(workspace, 'content/闲暇娱乐/2026-10-10/index.md'), article('插件验收', '最初正文。行内 `inline` 和 [链接中的 `code`](https://example.org/)。\n\n![演示视频](./assets/demo.mp4)\n\n```ts\nconst value = "<tag>&";\n\n// 中文注释\nconsole.log(value, 1);\n```\n\n```\n理解工具解决的问题 -> 理解项目的宏观架构\n```'));
  await writeFile(path.join(workspace, 'content/生活旁白/2026-10-10/index.md'), article('另一篇文章', '另一篇的完整正文。'));
  await writeFile(path.join(workspace, 'content/闲暇娱乐/2026-10-10/media.yaml'), 'assets: {}\n');
  await sharp({ create: { width: 160, height: 120, channels: 4, background: { r: 89, g: 107, b: 80, alpha: 1 } } }).png().toFile(path.join(workspace, 'content/闲暇娱乐/2026-10-10/assets/shape.png'));
  await sharp({ create: { width: 100, height: 500, channels: 4, background: 'green' } }).png().toFile(path.join(workspace, 'content/闲暇娱乐/2026-10-10/assets/second.png'));
  await writeFile(path.join(workspace, 'content/闲暇娱乐/2026-10-10/assets/demo.mp4'), Buffer.alloc(0));
  const archived = path.join(workspace, '.blog-store/drafts/versions/teaching/saved/content/闲暇娱乐/2026-10-10');
  await mkdir(path.join(archived, 'assets'), { recursive: true });
  const flowBody = '这里是旧稿的连贯正文，用于验证任意位置的文章仍能形成真实环绕。'.repeat(12) + '\n\n![归档图](./assets/shape.png)\n\n#### 旧稿后文\n\n旧稿原文仍可定位。\n\n```ts\nconst archived = "old";\n```';
  await writeFile(path.join(archived, 'index.md'), article('档案里的初稿', flowBody).replace('---\n\n', 'flow:\n  image: ./assets/shape.png\n  width: 180\n---\n\n'));
  await sharp({ create: { width: 120, height: 90, channels: 4, background: '#ad6147' } }).png().toFile(path.join(archived, 'assets/shape.png'));
  const exported = path.join(workspace, 'draft-review/first');
  await mkdir(path.join(exported, 'content'), { recursive: true }); await mkdir(path.join(exported, 'public/assets'), { recursive: true });
  await writeFile(path.join(exported, 'content/old-note.md'), '---\ntitle: 导出旧文章\ncategory: life\ndate: 2026-10-10\n---\n\n导出稿正文。\n\n![旧稿图片](/assets/legacy.png)');
  await sharp({ create: { width: 80, height: 60, channels: 4, background: '#596b50' } }).png().toFile(path.join(exported, 'public/assets/legacy.png'));
  const offline = path.join(temporary, 'offline');
  await mkdir(path.join(offline, 'assets'), { recursive: true });
  const singleFile = path.join(offline, '离线文章.md');
  const standalone = article('独立文件预览', flowBody.replaceAll('旧稿', '离线').replace('旧稿原文仍可定位', '离线原文仍可定位')).replace('---\n\n', 'category: life\nflow:\n  image: ./assets/shape.png\n  width: 180\n---\n\n');
  await writeFile(singleFile, standalone.replaceAll('\n', '\r\n'));
  await copyFile(path.join(archived, 'assets/shape.png'), path.join(offline, 'assets/shape.png'));
  await writeFile(path.join(offline, '邻稿.md'), article('独立邻稿', '邻稿正文。').replace('---\n\n', 'category: learn\n---\n\n'));
  const plainWorkspace = path.join(temporary, 'plain-workspace');
  await mkdir(plainWorkspace);
  const workspaceFile = path.join(temporary, 'test.code-workspace');
  await writeFile(workspaceFile, JSON.stringify({ folders: [{ path: workspace }, { path: plainWorkspace }] }));
  const executable = process.env.VSCODE_EXECUTABLE ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  async function host(target: string, name: string, extras: Record<string, string> = {}) {
    // Keep macOS's Unix-domain IPC socket path below its 103-character limit.
    const userDirectory = name === 'workspace' ? 'u' : 's';
    const child = spawn(executable, [target, `--extensionDevelopmentPath=${path.join(root, 'tools/vscode-preview')}`, `--extensionTestsPath=${path.join(root, 'tools/vscode-preview/dist/test-host.cjs')}`, `--user-data-dir=${path.join(temporary, userDirectory)}`, `--extensions-dir=${path.join(temporary, `e-${userDirectory}`)}`, '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--disable-updates', '--disable-telemetry', '--disable-gpu'], { env: { ...env, ...extras }, stdio: 'inherit' });
    const timeout = setTimeout(() => child.kill(), 150_000);
    try { return await new Promise<number>((resolve, reject) => { child.on('error', reject); child.on('exit', (exit) => resolve(exit ?? 1)); }); }
    finally { clearTimeout(timeout); }
  }
  const code = await host(workspaceFile, 'workspace', { SACHI_PREVIEW_EXTERNAL_FILE: singleFile });
  if (code !== 0) process.exitCode = code;
  else { const singleCode = await host(singleFile, 'single-file', { SACHI_PREVIEW_SINGLE_FILE: singleFile }); if (singleCode !== 0) process.exitCode = singleCode; }
} finally { server.kill('SIGTERM'); await rm(temporary, { recursive: true, force: true }); }
