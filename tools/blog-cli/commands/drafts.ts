import { BlogError, withLock } from '../../../src/lib/blog/files';
import { cachePath } from '../config';
import type { CommandContext } from '../context';
import { compareDrafts, describeDraft, draftArchivePath, draftDestination, exportDraft, listDrafts, migrateDrafts, prepareDraft, prepareDraftMigration, readDraft, saveDraft } from '../drafts';
import { commitDraftRestore, commitDraftUndo, describeDraftRestore, draftRestoreResult, prepareDraftRestore } from '../draft-restore';
import { prepareDraftUndo, recoverWritingTransactions } from '../writing-transactions';

export async function executeDrafts({ root, invocation, print, confirm }: CommandContext) {
  if (invocation.command !== 'draft') return false;
  const { options, selectors } = invocation;
  const action = invocation.draftAction ?? 'list';
  if (action === 'list') { print('READ', await listDrafts(root, selectors[0])); return true; }
  if (action === 'migrate') {
    const records = await prepareDraftMigration(root, selectors[0]);
    const result = { migrated: records.map((record) => ({ id: record.id, title: record.title, archivePath: draftArchivePath(record) })), retainedLegacy: true };
    if (options['dry-run']) { print('PLANNED', result); return true; }
    if (!records.length) { print('MIGRATED', result); return true; }
    await confirm(`将 ${records.length} 份旧稿转成独立完整目录，保留稿件 ID、时间、备注与原记录。`);
    print('MIGRATED', await withLock(cachePath(root, 'writing.lock'), () => migrateDrafts(root, records))); return true;
  }
  if (!selectors[0]) throw new BlogError(`draft ${action} 需要${action === 'save' ? '文章 ID、slug 或路径' : '完整稿件 ID'}。`, 2, 'INPUT_REQUIRED');
  if (action === 'show') { print('READ', await readDraft(root, selectors[0])); return true; }
  if (action === 'diff') { print('READ', await compareDrafts(root, selectors[0], selectors[1])); return true; }
  if (action === 'restore' || action === 'undo') {
    if (options['dry-run']) {
      if (action === 'restore') print('PLANNED', draftRestoreResult(await prepareDraftRestore(root, selectors[0])));
      else { const plan = await prepareDraftUndo(root, selectors[0]); print('PLANNED', { undo: selectors[0], articleId: plan.articleId, files: plan.changes.map((entry) => entry.file) }); }
      return true;
    }
    await withLock(cachePath(root, 'writing.lock'), async () => {
      const recovered = await withLock(cachePath(root, 'publish.lock'), () => recoverWritingTransactions(root));
      if (action === 'restore') {
        const plan = await prepareDraftRestore(root, selectors[0]);
        await confirm(describeDraftRestore(plan));
        print('RESTORED', { ...await withLock(cachePath(root, 'publish.lock'), () => commitDraftRestore(root, plan)), recovered });
      } else {
        const plan = await prepareDraftUndo(root, selectors[0]);
        await confirm(`撤销回档 ${selectors[0]}，恢复回档前的 ${plan.changes.length} 项实际文件。\n仅在这些文件未被额外编辑时执行，不改变公开版本。`);
        print('UNDONE', { ...await withLock(cachePath(root, 'publish.lock'), () => commitDraftUndo(root, selectors[0])), recovered });
      }
    });
    return true;
  }
  if (action === 'export') {
    const { record } = await readDraft(root, selectors[0]);
    const destination = await draftDestination(root, options.destination);
    if (options['dry-run']) { print('PLANNED', { id: record.id, title: record.title, destination, files: record.files.length, warnings: record.warnings }); return true; }
    await confirm(`将「${record.title}」第 ${record.sequence} 稿导出到 ${destination}，共 ${record.files.length} 项文件。\n当前文章与稿件历史保持原样。`);
    print('EXPORTED', await exportDraft(root, record.id, destination));
    return true;
  }
  const plan = await prepareDraft(root, selectors[0], options.note);
  if (options['dry-run']) { print('PLANNED', { ...plan, fingerprint: undefined }); return true; }
  await confirm(describeDraft(plan));
  const record = await withLock(cachePath(root, 'writing.lock'), () => saveDraft(root, plan));
  print('SAVED', { ...record, archivePath: draftArchivePath(record), recordFile: `${draftArchivePath(record)}/draft.json` });
  return true;
}
