import { writingPath } from '../../../src/lib/blog/storage';
import { exists, withLock, BlogError } from '../../../src/lib/blog/files';
import { cachePath } from '../config';
import type { CommandContext } from '../context';
import { assertNoPendingWrites } from '../writing-transactions';
import { checkToy, collectToyInput, prepareToy, saveToy, saveToyTemplate, templateTarget, toyCatalogue, toyReceipt } from '../toys';

export async function executeToys({ root, invocation, prompts, print, confirm }: CommandContext): Promise<boolean> {
  if (invocation.command !== 'toy') return false;
  const { options, selectors } = invocation;
  const action = invocation.toyAction ?? 'list';
  if (action === 'list') { print('READ', await toyCatalogue(root)); return true; }
  if (action === 'check') {
    let id = selectors[0];
    if (!id && prompts.enabled) {
      const catalogue = await toyCatalogue(root);
      if (!catalogue.toys.length) throw new BlogError('还没有已登记作品；先 toy add，或运行 toy list 查看读取问题。', 2, 'INPUT_REQUIRED');
      id = await prompts.select('选择作品重新检查（不上传、不改文件）', catalogue.toys.map((toy) => ({ name: toy.title, value: toy.id, description: toy.file })));
    }
    if (!id) throw new BlogError('toy check 需要完整作品 UUID。', 2, 'INPUT_REQUIRED');
    print('LOCAL_VALID', await checkToy(root, id)); return true;
  }
  if (!options['dry-run']) await assertNoPendingWrites(root);
  if (action === 'template') {
    const output = options.output ?? (prompts.enabled ? await prompts.input('填写模板输出路径（不能覆盖已有文件）', async (value) => { try { if (!value.trim()) return '请输入文件路径。'; await templateTarget(root, value.trim()); return true; } catch (error) { return (error as Error).message; } }) : undefined);
    if (!output) throw new BlogError('非交互模式需要 --output <尚不存在的YAML路径>。', 2, 'INPUT_REQUIRED');
    const file = await templateTarget(root, output);
    if (options['dry-run']) { print('PLANNED', { file, note: '将生成填写模板；不生成作品 ID，当前未写入文件。' }); return true; }
    await confirm(`生成填写模板：${file}\n不登记作品，不上传媒体，不生成作品 ID。`);
    print('CREATED', await withLock(cachePath(root, 'writing.lock'), async () => { await assertNoPendingWrites(root); return saveToyTemplate(root, output); }));
    return true;
  }
  const { input, origin } = await collectToyInput(root, options, prompts);
  if (input.id && await exists(await writingPath(root, `content/toys/${input.id}`))) throw new BlogError(`作品 ID 已存在，拒绝覆盖：${input.id}`, 4, 'TOY_EXISTS');
  const plan = await prepareToy(root, input, origin);
  if (options['dry-run']) { print('PLANNED', { ...toyReceipt(plan), sources: { cover: input.cover, video: input.video }, note: '本地检查通过；未登记作品、未生成新 ID。Yandu 尚未接入，压缩后大小及保留时长未知。' }); return true; }
  await confirm(`登记本地作品：${input.title}\n简介：${input.description}\n封面：${input.cover}\n视频：${input.video}（原文件 ${plan.video.bytes} 字节，${plan.video.durationSeconds} 秒）\n项目：${plan.project.url}（匿名 HTTP ${plan.project.statusCode}）\n未来超限策略：${input.videoOverflow === 'reject' ? '拒绝，不裁剪' : '已授权保留开头、删除尾部'}；输出上限 10,000,000 字节。\n只保存资料与源文件摘要；待媒体处理，不上传、不进入舞台或公开集合。`);
  print('PREPARED', await withLock(cachePath(root, 'writing.lock'), async () => { await assertNoPendingWrites(root); return saveToy(root, plan); }));
  return true;
}
