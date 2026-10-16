import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { backupWriting, initializeBackup } from './backup';
import { migrateStorage, undoMigration, type Migration } from './migrate';

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    root: { type: 'string' }, remote: { type: 'string' }, 'dry-run': { type: 'boolean' }, 'archive-empty-builds': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('npm run backup -- init --remote <私有GitHub仓库地址>\nnpm run backup -- --dry-run\nnpm run backup\nnpm run backup -- migrate [--archive-empty-builds] [--dry-run]\nnpm run backup -- undo-migration <迁移ID>\n初始化不推送；backup 只提交和推送 .blog-store，不发布网页。'); return;
  }
  const root = path.resolve(values.root ?? process.cwd());
  const command = positionals[0] ?? 'backup';
  if (values.remote && command !== 'init' || values['archive-empty-builds'] && command !== 'migrate' || values['dry-run'] && !['backup', 'migrate'].includes(command) || positionals.length > (command === 'undo-migration' ? 2 : 1)) throw new Error('参数与命令不匹配，使用 --help 查看。');
  const result = command === 'init' ? await initializeBackup(root, values.remote ?? '')
    : command === 'migrate' ? await migrateStorage(root, { archiveEmptyBuilds: values['archive-empty-builds'], dryRun: values['dry-run'] })
    : command === 'undo-migration' && positionals[1] ? await undoMigration(root, positionals[1])
    : command === 'backup' ? await backupWriting(root, { dryRun: values['dry-run'] })
    : (() => { throw new Error('未知命令，使用 --help 查看。'); })();
  const migration = 'migration' in result ? result.migration as Migration | null : null;
  const output = migration ? { status: result.status, migration: {
    id: migration.id,
    moves: migration.moves.map((move) => ({ from: move.from, to: move.to, files: Object.keys(move.hashes).length })),
    preservedFiles: Object.keys(migration.protected).length,
  } } : result;
  console.log(JSON.stringify(output, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
