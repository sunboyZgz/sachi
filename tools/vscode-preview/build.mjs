import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
await mkdir(path.join(directory, 'dist'), { recursive: true });
const common = { bundle: true, absWorkingDir: root, logLevel: 'info', jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json') };
await Promise.all([
  build({ ...common, entryPoints: [path.join(directory, 'src/extension.ts')], outfile: path.join(directory, 'dist/extension.cjs'), platform: 'node', target: 'node20', format: 'cjs', external: ['vscode'] }),
  build({ ...common, entryPoints: [path.join(directory, 'src/webview.tsx')], outfile: path.join(directory, 'dist/webview.js'), platform: 'browser', target: 'chrome120', format: 'iife', minify: true,
    loader: { '.png': 'file' }, assetNames: 'assets/[name]-[hash]', define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_BLOG_BASE_PATH': '""', 'process.env.NEXT_PUBLIC_BLOG_ASSET_PREFIX': '""' } }),
  build({ ...common, entryPoints: [path.join(directory, 'src/test-host.ts')], outfile: path.join(directory, 'dist/test-host.cjs'), platform: 'node', target: 'node20', format: 'cjs', external: ['vscode'] }),
]);
