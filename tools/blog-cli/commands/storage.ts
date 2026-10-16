import path from 'node:path';
import { BlogError, writeJson, withLock } from '../../../src/lib/blog/files';
import { postSchema } from '../../../src/lib/blog/schema';
import { resourceUrl } from '../../../src/lib/blog/yandu';
import { assertNoPendingWrites } from '../writing-transactions';
import { cachePath, storePath } from '../config';
import type { CommandContext } from '../context';
import { YanduStorage, uploadFile } from '../yandu';
import { storageInventory, storageStatus, syncStorage, restoreStorage, listStorageCheckpoints, setProfileAvatar } from '../yandu-sync';

export async function executeStorage(context: CommandContext): Promise<boolean> {
  const { root, config, invocation, prompts, print, confirm } = context;
  if (invocation.command !== 'storage') return false;
  const { options } = invocation;
  let action = invocation.storageAction;
  if (!action && prompts.enabled) action = await prompts.select('Yandu 存储', [
    { name: '初始化 / 校验专用目录', value: 'init' }, { name: '查看本地保存状态', value: 'status' },
    { name: '同步全部私有写作资料（不上线）', value: 'sync' }, { name: '查看云端写作检查点', value: 'list' },
    { name: '从云端恢复到新目录', value: 'restore' }, { name: '选择并上传个人头像', value: 'avatar' },
    { name: '按文章 / 作品 ID 保存资源', value: 'upload' },
  ]) as NonNullable<CommandContext['invocation']['storageAction']>;
  if (!action) throw new BlogError('请指定 storage 子命令，或在终端运行 blog storage。', 2);
  if (action === 'status') { print('READ', await storageStatus(root, config)); return true; }
  if (action === 'init') {
    if (options['dry-run']) { print('PLANNED', { projectId: config.yandu?.projectId, directories: ['profile/avatars', 'articles', 'works', 'archives'] }); return true; }
    await confirm('在已选 Yandu 项目内创建或复用 Sachi 逻辑目录，保留全部已有文件。');
    print('INITIALIZED', await new YanduStorage(root, config).initialize()); return true;
  }
  if (action === 'list') { print('READ', { checkpoints: await listStorageCheckpoints(root, config) }); return true; }
  if (action === 'sync') {
    const files = await storageInventory(root, config);
    const plan = { files: files.map(({ path, sha256, bytes, folder }) => ({ path, sha256, bytes, folder })), bytes: files.reduce((sum, file) => sum + file.bytes, 0), projectId: config.yandu?.projectId ?? null };
    if (options['dry-run']) { print('PLANNED', plan); return true; }
    await assertNoPendingWrites(root);
    if (prompts.enabled && !options.resolve?.length) {
      const entries = await listStorageCheckpoints(root, config);
      const heads = entries.filter((entry) => entry.head && entry.state === 'conflict');
      if (heads.length) options.resolve = await prompts.checkbox('确认已在本地合并需要的内容，再选择全部冲突头提交新检查点（不会自动合并正文）', heads.map((entry) => ({ name: entry.checkpoint, value: entry.checkpoint })));
    }
    await confirm(`将 ${files.length} 个私有文件（${plan.bytes} 字节）保存到 Yandu，不改变公开集合。保留本地原件与迁移记录。${options.resolve?.length ? `\n使用当前本地资料合并这些远端分支：${options.resolve.join('、')}` : ''}`);
    print('SAVED', await syncStorage(root, config, { resolve: options.resolve })); return true;
  }
  if (action === 'restore') {
    let checkpoint = invocation.selectors[0], destination = options.destination;
    if (!checkpoint && prompts.enabled) {
      const entries = await listStorageCheckpoints(root, config);
      if (!entries.length) throw new BlogError('Yandu 尚无可恢复检查点。', 2);
      checkpoint = await prompts.select('选择私有写作检查点', entries.map((entry) => ({ name: entry.checkpoint, value: entry.checkpoint })));
    }
    if (!destination && prompts.enabled) destination = await prompts.input('恢复到尚不存在的新目录', (value) => value.trim() ? true : '请输入新目录。');
    if (!checkpoint || !destination) throw new BlogError('storage restore 需要检查点名称及 --destination。', 2, 'INPUT_REQUIRED');
    if (options['dry-run']) { print('PLANNED', { checkpoint, destination: path.resolve(root, destination) }); return true; }
    await confirm(`校验并恢复 ${checkpoint} 到 ${path.resolve(root, destination)}，不覆盖当前工作资料。`);
    print('RESTORED', await restoreStorage(root, config, checkpoint, destination)); return true;
  }
  if (action === 'avatar') {
    let kind = invocation.selectors[0], file = options.file;
    if (!kind && prompts.enabled) kind = await prompts.select('头像用途', [{ name: '头部：封面 / 目录', value: 'head' }, { name: '半身：文章末署名', value: 'half' }]);
    if (!file && prompts.enabled) file = await prompts.input('头像原图路径（保留原件）', (value) => value.trim() ? true : '请输入文件路径。');
    if (!['head', 'half'].includes(kind) || !file) throw new BlogError('storage avatar head|half --file <图片路径>。', 2, 'INPUT_REQUIRED');
    if (options['dry-run']) { print('PLANNED', { kind, file }); return true; }
    await assertNoPendingWrites(root); await confirm(`上传并校验 ${kind} 头像后更新个人资料引用；原头像及旧资料会保留。发布时才更新公开网站。`);
    print('SAVED', await setProfileAvatar(root, config, kind as 'head' | 'half', file)); return true;
  }
  if (action === 'upload') {
    let [kind, owner] = invocation.selectors; let file = options.file;
    if (!kind && prompts.enabled) kind = await prompts.select('资源所属', [{ name: '文章', value: 'article' }, { name: '作品', value: 'work' }]);
    if (!owner && prompts.enabled) owner = await prompts.input('完整文章 / 作品 ID', (value) => postSchema.shape.id.safeParse(value).success ? true : '请输入完整 ID。');
    if (!file && prompts.enabled) file = await prompts.input('本地资源文件路径', (value) => value.trim() ? true : '请输入路径。');
    if (!['article', 'work'].includes(kind) || !postSchema.shape.id.safeParse(owner).success || !file) throw new BlogError('storage upload article|work <完整ID> --file <本地文件>。', 2, 'INPUT_REQUIRED');
    if (options['dry-run']) { print('PLANNED', { kind, owner, file }); return true; }
    await confirm(`保存 ${kind} ${owner} 的私有资源；不会因上传而公开。`);
    const ref = await uploadFile(root, config, `${kind === 'article' ? 'articles' : 'works'}/${owner}`, path.resolve(root, file));
    await withLock(cachePath(root, 'writing.lock'), async () => {
      const mapping = storePath(root, 'yandu', 'associations', `${owner}-${ref.sha256}.json`);
      await writeJson(mapping, { kind, ownerId: owner, originalName: path.basename(file!), resource: ref });
    });
    print('SAVED', { ownerId: owner, resource: ref, candidateUrl: resourceUrl(ref), anonymousAccess: false }); return true;
  }
  throw new BlogError(`未知存储操作：${action}`, 2);
}
