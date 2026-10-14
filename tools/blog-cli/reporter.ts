import type { Plan } from './plan';
import { categoryNames } from '../../src/lib/blog/schema';
import { describeInsertion, type InsertionResult } from './series-insertion';
import { describeFormat, type FormatResult } from './format';
import { describeDraft, draftArchivePath, type DraftRecord, type DraftPlan } from './drafts';

export function describePlan(plan: Plan): string {
  const titles = (ids: string[]) => ids.map((id) => plan.manifest.entries.find((entry) => entry.id === id)?.title ?? id);
  return [
    `发布版本：${plan.manifest.releaseId}`,
    `基于版本：${plan.manifest.baseReleaseId ?? '首次发布'}`,
    `本次选择 ${plan.selected.length} 篇：${titles(plan.selected).join('、') || '无'}`,
    `保留旧快照 ${plan.unchanged.length} 篇：${titles(plan.unchanged).join('、') || '无'}`,
    `不纳入公开内容的本地文章：${plan.excluded.length} 篇`,
    ...(plan.selectedSeries?.length ? [`本次系列资料：${plan.seriesChanges?.map((item) => item.title).join('、') || '资料未变'}`] : []),
    `已撤回（含历史）：${plan.manifest.retired.map((entry) => entry.title).join('、') || '无'}`,
    `全站代码/配置基线：${plan.baselineChanged ? '变化，执行前须单独接受' : '未变或首次建立'}`,
  ].join('\n');
}

const stateNames: Record<string, string> = { draft: '草稿', published: '已发布', modified: '有未发布修改', withdrawn: '已撤回', missing: '线上存在、本地缺失', unverified: '未核实线上' };
const statusNames: Record<string, string> = { PLANNED: '计划（未执行）', VALID: '检查通过', CACHED: '本地缓存（未核实线上）', VERIFIED: '已核实服务器', BUILD_ONLY: '本地构建完成（未上线）', DEPLOYED: '已上线', PUSHED: '冻结版本已推送（Pages 待核实上线）', PARTIAL_OR_FAILED: '部分目标失败，请查看两个钩子的结果', CREATED: '已创建', UPDATED: '已修改', READ: '文章信息', INITIALIZED: '配置已保存', RESTORED: '已恢复到新目录', SKIPPED: '已跳过', CHECKED: '环境检查', PREVIEW: '本地预览' };

export function humanResult(command: string, status: string, data: unknown): string {
  const heading = `${command}：${statusNames[status] ?? status}`;
  if (typeof data === 'string') return `${heading}\n${data}`;
  if (!data || typeof data !== 'object') return `${heading}\n${String(data)}`;
  const record = data as Record<string, unknown>;
  if (command === 'draft') {
    if (Array.isArray(record.drafts)) return ['稿件历史（本地）：',
      ...(record.drafts as DraftRecord[]).map((draft) => `${draft.title} · 第 ${draft.sequence} 稿 · ${draft.createdAt}\n  备注：${draft.note || '未填写'}\n  稿件 ID：${draft.id}\n  文章 ID：${draft.articleId}\n  ${draft.schemaVersion === 2 ? `完整目录：${draftArchivePath(draft)}\n  原文：${draftArchivePath(draft)}/${draft.sourcePath}` : '旧对象格式：可用 draft migrate 转换完整稿件'}`),
      record.drafts.length ? '' : '尚无留存稿件。', ...((record.issues ?? []) as Array<{ file: string; message: string }>).map((issue) => `读取问题：${issue.file} · ${issue.message}`)].filter(Boolean).join('\n');
    if (typeof record.markdown === 'string') {
      const draft = record.record as DraftRecord;
      return `稿件：${draft.title} · 第 ${draft.sequence} 稿 · ${draft.note || '未填写备注'}\n时间：${draft.createdAt}\nID：${draft.id}\n\n${record.markdown}`;
    }
    if (typeof record.patch === 'string') return [`稿件对比：${record.title}\n${record.from} → ${record.to === 'working' ? '当前稿' : record.to}`, record.changed ? record.patch : '原文与素材没有变化。',
      ...((record.files ?? []) as Array<{ file: string; before: string | null; after: string | null }>).map((entry) => `文件${!entry.before ? '新增' : !entry.after ? '移除' : '变化'}：${entry.file}`)].join('\n');
    if (Array.isArray(record.migrated)) return [status === 'PLANNED' ? '旧稿完整目录转换计划（未写入）' : '旧稿完整目录转换完成',
      ...(record.migrated as Array<{ id: string; title: string; archivePath: string }>).map((entry) => `${entry.title} · ${entry.id}\n  ${entry.archivePath}`), record.migrated.length ? '原 ID、时间、备注与旧记录保留。' : '没有需要转换的旧稿。'].join('\n');
    if (record.undo) return [`${status === 'PLANNED' ? '撤销回档计划（未写入）' : '回档已撤销'}：${record.undo}`, record.transaction ? `新回档记录 ID：${record.transaction}` : '', '只影响本地文件，公开版本保持原样。'].filter(Boolean).join('\n');
    if (Array.isArray(record.changes)) return [status === 'PLANNED' ? '回档计划（未写入）' : record.changed ? '正文与资源已回档' : '当前文件已是此版本，无需回档',
      `文章：${record.title} · ${record.articleId}\n目标稿件：${record.id}`, ...(record.changes as Array<{ file: string; action: string }>).map((entry) => `${entry.action} · ${entry.file}`),
      record.transaction ? `回档记录 ID：${record.transaction}\n撤销命令：npm run blog -- draft undo ${record.transaction}\n当前文件备份：${record.backupPath}` : '', '只修改本地文件，未发布。'].filter(Boolean).join('\n');
    if (record.destination) return [`稿件${status === 'PLANNED' ? '导出计划（未写入）' : '已取回到新目录'}：${record.title}`, `ID：${record.id}`, `目录：${record.destination}`, record.sourceFile ? `原文：${record.sourceFile}` : '', '当前文章保持原样。', ...((record.warnings ?? []) as string[]).map((warning) => `提示：${warning}`)].filter(Boolean).join('\n');
    return [`${status === 'PLANNED' ? '留存计划（未写入）' : '稿件已留存'}`, describeDraft(data as DraftPlan), record.id ? `稿件 ID：${record.id}\n时间：${record.createdAt}\n记录：${record.recordFile}` : '执行后才生成稿件 ID。'].join('\n');
  }
  if (command === 'format') return `format：${status === 'UNCHANGED' ? '无需修改' : statusNames[status] ?? status}\n${describeFormat(data as FormatResult)}${status === 'PLANNED' ? '\n未写入文件。' : status === 'UPDATED' ? '\n格式化已保存，尚未发布。' : ''}${Array.isArray(record.recovered) && record.recovered.length ? `\n已恢复上次未完成的写作事务：${record.recovered.join('、')}` : ''}`;
  if (command === 'toy') {
    const issues = (record.issues ?? []) as Array<{ file: string; message: string }>;
    if (Array.isArray(record.toys)) {
      const toys = record.toys as Array<{ id: string; title: string; file: string }>;
      return ['作品资料（只读）：', ...toys.map((toy) => `${toy.title} · 待媒体处理\n  ID：${toy.id}\n  文件：${toy.file}`), toys.length ? '' : '暂无已登记作品。', ...issues.map((issue) => `读取问题：${issue.file} · ${issue.message}`)].filter(Boolean).join('\n');
    }
    const video = record.video as { bytes: number; durationSeconds: number } | undefined;
    return [`toy：${status === 'PREPARED' ? '本地资料已登记' : status === 'LOCAL_VALID' ? '本地检查通过' : statusNames[status] ?? status}`,
      record.title ? `作品：${record.title}` : '', record.id ? `ID：${record.id}` : '', record.file ? `文件：${record.file}` : '',
      record.state ? '状态：待媒体处理' : '', video ? `视频原文件：${video.bytes} 字节；${video.durationSeconds} 秒` : '',
      record.videoOverflow ? `未来超限策略：${record.videoOverflow === 'reject' ? '拒绝，不裁剪' : '允许保留开头、删除尾部'}` : '',
      record.processing ? '压缩后大小：未知；裁剪后保留秒数：未知；未来输出上限：10,000,000 字节。' : '',
      record.note ? String(record.note) : ''].filter(Boolean).join('\n');
  }
  if (Array.isArray(record.matches)) {
    const matches = record.matches as Array<{ id: string; title: string; category: keyof typeof categoryNames; file: string; series?: { id: string; order: number } }>;
    return [`${record.kind === 'article' ? '文章' : '系列'}搜索：${record.query}`, `匹配 ${matches.length} 项：`,
      ...matches.map((match) => `${match.title} · ${categoryNames[match.category]}\n  ID：${match.id}\n  文件：${match.file}${match.series ? `\n  所属系列：${match.series.id} · 第 ${match.series.order} 章` : ''}`),
      matches.length ? '' : '没有匹配结果，请尝试更短或不同的关键词。',
      ...(record.issues as Array<{ file: string; message: string }>).map((issue) => `读取问题：${issue.file} · ${issue.message}`)].filter(Boolean).join('\n');
  }
  if (record.articleId && Array.isArray(record.changes)) return `${heading}\n${describeInsertion(data as InsertionResult)}${status === 'PLANNED' ? '\n未写入文件。' : '\n归属与顺延已保存，尚未上线。'}${Array.isArray(record.recovered) && record.recovered.length ? '\n已恢复上次未完成的写作事务。' : ''}`;
  if (command === 'series' && status === 'CREATED' && record.id && record.title) return `${heading}\n系列：${record.title}\n栏目：${categoryNames[record.category as keyof typeof categoryNames]}\nID：${record.id}\n文件：${record.file}`;
  if (record.manifest && Array.isArray(record.selected) && Array.isArray(record.unchanged)) {
    return `${heading}\n${describePlan(data as Plan)}\n${record.note ?? '未执行构建或上线。'}`;
  }
  if (Array.isArray(record.articles)) {
    const articles = record.articles as { title: string; state: string; file: string }[];
    return [heading, `当前版本：${record.releaseId ?? '无'}；核实时间：${record.checkedAt ?? '无'}；Git：${record.git}`,
      ...articles.map((post) => `  ${stateNames[post.state] ?? post.state} · ${post.title}\n    ${post.file}`),
      articles.length ? '' : '暂无正式文章。',
      `内容问题：${JSON.stringify(record.issues)}`,
      record.backup ? `备份状态：${JSON.stringify(record.backup)}` : '',
      record.pages ? `Pages 状态：${JSON.stringify(record.pages)}` : '',
    ].filter(Boolean).join('\n');
  }
  return `${heading}\n${JSON.stringify(data, null, 2)}`;
}
