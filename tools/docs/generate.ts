import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from '../../src/lib/blog/files';
import { referencePages } from './reference';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs-site');
for (const [file, content] of Object.entries(referencePages())) await atomicWrite(path.join(root, file), content);
console.log('命令参考已从实际 CLI 定义同步。');
