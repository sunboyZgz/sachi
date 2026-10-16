import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { exists } from '../../src/lib/blog/files';
import { navigation } from '../../docs-site/.vitepress/navigation';
import { referencePages } from './reference';
import { exampleDefinitions } from './examples';

async function sourcePages(root: string, relative = ''): Promise<string[]> {
  const pages: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.vitepress') continue;
    const file = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`手册源文件不允许符号链接：${file}`);
    if (entry.isDirectory()) pages.push(...await sourcePages(root, file));
    else if (entry.isFile() && file.endsWith('.md') && file !== 'README.md') pages.push(file);
  }
  return pages.sort();
}

export async function checkDocs(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs-site')) {
  const pages = await sourcePages(root);
  const issues: string[] = [];
  for (const section of navigation) for (const item of section.items) {
    if (!await exists(path.join(root, `${item.link.slice(1)}.md`))) issues.push(`目录目标缺失：${item.link}`);
  }
  for (const [file, expected] of Object.entries(referencePages())) {
    if (!await exists(path.join(root, file)) || await readFile(path.join(root, file), 'utf8') !== expected) issues.push(`参数参考未同步：${file}（运行 npm run docs:generate）`);
  }
  const required = ['什么时候用', '开始前', '操作步骤', '确认结果', '影响与取消', '常见问题', '参数方式'];
  const exampleIds = new Set<string>(exampleDefinitions.map((example) => example.id));
  for (const file of pages) {
    const source = await readFile(path.join(root, file), 'utf8');
    if (!file.startsWith('reference/') && file !== 'index.md') for (const title of required) if (!source.includes(`## ${title}`)) issues.push(`任务页缺少章节：${file} / ${title}`);
    const withoutCode = source.replace(/```[^\n]*\n[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const match of source.matchAll(/<BlogExample\s+example="([^"]+)"/g)) if (!exampleIds.has(match[1])) issues.push(`未知效果示例：${file} -> ${match[1]}`);
    for (const example of exampleDefinitions.filter((example) => example.page === file)) {
      if (!source.includes(`<<< @/.vitepress/examples/${example.id}.md`) || !source.includes(`<BlogExample example="${example.id}"`)) issues.push(`示例源码或生成效果缺失：${file} / ${example.id}`);
    }
    for (const match of withoutCode.matchAll(/\]\((\/[^)#\s]+)(?:#[^)]*)?\)|href="(\/[^"#]+)(?:#[^"]*)?"|withBase\('(\/[^'#]+)(?:#[^']*)?'\)/g)) {
      const raw = match[1] ?? match[2] ?? match[3];
      if (raw.startsWith('/examples/') || raw.startsWith('/licenses/')) {
        if (raw.includes('..') || !await exists(path.join(root, 'public', raw.slice(1)))) issues.push(raw.startsWith('/examples/') ? `教学素材缺失：${file} -> ${raw}（运行 npm run docs:examples）` : `许可证文件缺失：${file} -> ${raw}`);
        continue;
      }
      const target = raw.replace(/\.html$/, '').replace(/\/$/, '/index');
      if (!await exists(path.join(root, `${target.slice(1)}.md`))) issues.push(`链接目标缺失：${file} -> ${target}`);
    }
    if (/(?:href|src)=["'][^"']*(?:\.blog-store|\/content\/)/.test(withoutCode)) issues.push(`不允许索引或链接私有内容：${file}`);
  }
  if (issues.length) throw new Error(issues.join('\n'));
  return { pages: pages.length, commands: Object.keys(referencePages()).length - 1 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkDocs().then((result) => console.log(`手册检查通过：${result.pages} 页，${result.commands} 条命令，链接与参数同步有效。`)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
}
