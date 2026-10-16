import { lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function docsBase(
  file = fileURLToPath(new URL('../docs.config.json', import.meta.url)),
  env: Record<string, string | undefined> = process.env,
) {
  let base: unknown;
  let raw: string | undefined;
  try {
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) throw new Error('Invalid file');
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('无法读取 docs.config.json；不回退到 DOCS_BASE。');
    base = env.DOCS_BASE ?? '/';
  }
  if (raw !== undefined) {
    let settings;
    try { settings = JSON.parse(raw); }
    catch { throw new Error('docs.config.json 不是有效 JSON；不回退到 DOCS_BASE。'); }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || settings.schemaVersion !== 1 || Object.keys(settings).some((key) => !['schemaVersion', 'base'].includes(key))) throw new Error('docs.config.json 仅支持 schemaVersion: 1 和 base。');
    base = settings.base;
  }
  if (typeof base !== 'string' || !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('手册 base 必须是 / 或 /handbook/ 这样的路径。');
  return base;
}
