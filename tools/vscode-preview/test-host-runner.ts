import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

const root = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), 'sachi-extension-'));
try {
  const workspace = path.join(temporary, 'workspace');
  for (const directory of ['src/styles', 'src/config', 'src/assets/avatar', 'content/闲暇娱乐/2026-10-10/assets', 'content/生活旁白/2026-10-10/assets']) await mkdir(path.join(workspace, directory), { recursive: true });
  for (const file of ['src/styles/tokens.css', 'src/styles/site.css', 'src/config/profile.json', 'src/assets/avatar/avatar-half.png']) await copyFile(path.join(root, file), path.join(workspace, file));
  await writeFile(path.join(workspace, 'package.json'), '{"name":"sachi-blog","private":true}');
  const article = (title: string, body: string) => `---\nid: ${randomUUID()}\ntitle: ${title}\ncreatedAt: "2026-10-10T09:00:00+08:00"\n---\n\n${body}\n`;
  await writeFile(path.join(workspace, 'content/闲暇娱乐/2026-10-10/index.md'), article('插件验收', '最初正文。\n\n![演示视频](./assets/demo.mp4)\n\n```ts\nconst value = 1;\n```'));
  await writeFile(path.join(workspace, 'content/生活旁白/2026-10-10/index.md'), article('另一篇文章', '另一篇的完整正文。'));
  await writeFile(path.join(workspace, 'content/闲暇娱乐/2026-10-10/media.yaml'), 'assets: {}\n');
  await sharp({ create: { width: 160, height: 120, channels: 4, background: { r: 89, g: 107, b: 80, alpha: 1 } } }).png().toFile(path.join(workspace, 'content/闲暇娱乐/2026-10-10/assets/shape.png'));
  await writeFile(path.join(workspace, 'content/闲暇娱乐/2026-10-10/assets/demo.mp4'), Buffer.alloc(0));
  const executable = process.env.VSCODE_EXECUTABLE ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [workspace, `--extensionDevelopmentPath=${path.join(root, 'tools/vscode-preview')}`, `--extensionTestsPath=${path.join(root, 'tools/vscode-preview/dist/test-host.cjs')}`, `--user-data-dir=${path.join(temporary, 'user-data')}`, `--extensions-dir=${path.join(temporary, 'extensions')}`, '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--disable-updates', '--disable-telemetry', '--disable-gpu'], { env, stdio: 'inherit' });
  const timeout = setTimeout(() => child.kill(), 120_000);
  const code = await new Promise<number>((resolve, reject) => { child.on('error', reject); child.on('exit', (exit) => resolve(exit ?? 1)); });
  clearTimeout(timeout);
  if (code !== 0) process.exitCode = code;
} finally { await rm(temporary, { recursive: true, force: true }); }
