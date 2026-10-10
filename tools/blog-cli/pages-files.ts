import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { BlogError, walk } from '../../src/lib/blog/files';

export async function pagesFiles(root: string) {
  const files: string[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (['.git', 'node_modules', '.next', 'out'].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new BlogError(`Pages 包不能含符号链接：${entry.name}`, 6);
    if (entry.isDirectory()) files.push(...(await walk(path.join(root, entry.name))).map((file) => `${entry.name}/${file}`));
    else if (entry.isFile()) files.push(entry.name);
    else throw new BlogError(`Pages 包含特殊文件：${entry.name}`, 6);
  }
  return files.filter((file) => file !== '.blog-input/checksums.json').sort();
}
