import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
const portArg = process.argv.find((argument) => argument.startsWith('--port='));
const port = Number(portArg?.split('=')[1] ?? process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('端口必须为 1–65535 的整数。');
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405);
      response.end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.includes('\0') || pathname.split('/').some((part) => part === '..')) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const relative = pathname === '/'
      ? 'index.html'
      : path.extname(pathname)
        ? pathname.slice(1)
        : path.join(pathname.slice(1), 'index.html');
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`) || !(await stat(target)).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : await readFile(target));
  } catch (error) {
    response.writeHead(error?.code === 'ENOENT' ? 404 : 400);
    response.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`静态导出预览：http://127.0.0.1:${port}`);
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
