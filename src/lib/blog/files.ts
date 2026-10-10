import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class BlogError extends Error {
  constructor(message: string, public code = 3, public status = 'ERROR', public details?: unknown) { super(message); }
}
export function sha256(value: string | Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export async function exists(file: string) {
  try { await lstat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export function inside(root: string, relative: string) {
  if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.includes('\0') || relative.split('/').some((p) => p === '..')) throw new BlogError(`不安全的路径：${relative}`);
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new BlogError(`路径越界：${relative}`);
  return target;
}
export async function safeFile(root: string, relative: string) {
  if ((await lstat(root)).isSymbolicLink()) throw new BlogError(`资源根不能是符号链接：${root}`);
  const target = inside(root, relative);
  const base = await realpath(root);
  let current = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new BlogError(`不允许符号链接：${relative}`);
  }
  if (!(await realpath(target)).startsWith(`${base}${path.sep}`) || !(await lstat(target)).isFile()) throw new BlogError(`不是安全的普通文件：${relative}`);
  return target;
}
export async function walk(root: string, prefix = ''): Promise<string[]> {
  if (!(await exists(root))) return [];
  if ((await lstat(root)).isSymbolicLink()) throw new BlogError(`扫描根不能是符号链接：${root}`);
  const files: string[] = [];
  for (const item of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw new BlogError(`不允许符号链接：${relative}`);
    if (item.isDirectory()) files.push(...await walk(path.join(root, item.name), relative));
    else if (item.isFile()) files.push(relative);
    else throw new BlogError(`不允许特殊文件：${relative}`);
  }
  return files;
}
export async function safeDirectory(root: string, relative: string) {
  const target = inside(root, relative);
  let current = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    current = path.join(current, part);
    if (await exists(current)) {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new BlogError(`目录不是安全的普通目录：${current}`);
    } else {
      try { await mkdir(current); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new BlogError(`目录创建冲突：${current}`);
    }
  }
  return target;
}
export async function atomicWrite(file: string, bytes: string | Uint8Array) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID()}`;
  try { await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
export async function writeJson(file: string, value: unknown) { await atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`); }
export async function readJson(file: string): Promise<unknown> { return JSON.parse(await readFile(file, 'utf8')); }
export async function withLock<T>(file: string, action: () => Promise<T>): Promise<T> {
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(file, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { flag: 'wx' }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new BlogError(`另一个操作持有锁：${file}。确认进程已结束后才可手动移除该锁。`, 4); throw error; }
  try { return await action(); } finally { await rm(file, { force: true }); }
}
