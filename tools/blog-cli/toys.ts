import { physicalSourcePath, writingPath, writingDirectory } from '../../src/lib/blog/storage';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, lstat, mkdir, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import { BlogError, exists, safeDirectory, sha256, stableJson } from '../../src/lib/blog/files';
import type { CliOptions } from './arguments';
import type { PromptDriver } from './prompts';
import { checkProjectUrl, parseProjectUrl, type PublicUrlCheck } from './public-url';
import { run } from './process';

export const toyVideoLimit = 10_000_000;
const text = z.string().trim().min(1, '不能留空').max(65_536, '单个文字字段不能超过 65536 字符');
export const overflowSchema = z.enum(['reject', 'trim-start']);
const fields = {
  id: z.uuid().transform((value) => value.toLowerCase()).optional(),
  title: text, description: text, cover: text, video: text, projectUrl: text,
  coverFit: z.enum(['contain', 'cover']).default('cover'),
  coverPosition: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]).default([50, 50]),
  videoLabel: text.optional(), videoOverflow: overflowSchema,
};
export const toyInputSchema = z.strictObject(fields);
export type ToyInput = z.infer<typeof toyInputSchema>;
const digestSchema = z.strictObject({ hash: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() });
const projectCheckSchema = z.strictObject({ url: text, finalUrl: text, statusCode: z.number().int().min(200).max(299), checkedAt: z.iso.datetime() });
export const toyRecordSchema = z.strictObject({
  ...fields, id: z.uuid(), schemaVersion: z.literal(1), state: z.literal('pending-media'), createdAt: z.iso.datetime(),
  validation: z.strictObject({
    checkedAt: z.iso.datetime(), project: projectCheckSchema,
    cover: digestSchema.extend({ width: z.number().int().positive(), height: z.number().int().positive(), format: text }),
    video: digestSchema.extend({ width: z.number().int().positive(), height: z.number().int().positive(), durationSeconds: z.number().positive(), format: text }),
  }),
  processing: z.strictObject({ maxOutputBytes: z.literal(toyVideoLimit), outputBytes: z.null(), retainedSeconds: z.null() }),
});
export type ToyRecord = z.infer<typeof toyRecordSchema>;
type Origin = { file: string; hash: string };
export type ToyPlan = { input: ToyInput; project: PublicUrlCheck; cover: ToyRecord['validation']['cover']; video: ToyRecord['validation']['video']; origin?: Origin };

export const toyTemplate = `# 本文件是填写模板，不会自动上传或进入舞台。相对媒体路径以本文件所在目录为准。
# 必填：名称、简介、本地封面、本地视频、公网项目地址、超限处理方式。
title: ""
description: ""
cover: ./assets/cover.png
video: ./assets/demo.mp4
projectUrl: ""
# reject：压缩后超限就拒绝；trim-start：允许保留开头、删除尾部。
# 这是未来媒体处理的预先授权；当前 CLI 不上传、不压缩、不裁剪。
videoOverflow: reject
# 可选：封面适配、位置（0–100）、视频说明。没有序号字段。
coverFit: cover
coverPosition: [50, 50]
# videoLabel: 一段操作演示
`;

function parseYaml(raw: string, file: string): unknown {
  const document = parseDocument(raw, { uniqueKeys: true, strict: true });
  if (document.errors.length || document.warnings.length) throw new BlogError(`作品 YAML 无效：${file}\n${[...document.errors, ...document.warnings].map((error) => error.message).join('\n')}`, 3, 'INVALID_TOY');
  try { return document.toJS({ maxAliasCount: 0 }); }
  catch { throw new BlogError(`作品 YAML 不允许别名：${file}`, 3, 'INVALID_TOY'); }
}
function parseInput(value: unknown): ToyInput {
  const result = toyInputSchema.safeParse(value);
  if (!result.success) throw new BlogError(`作品资料未通过：${z.prettifyError(result.error)}`, 3, 'INVALID_TOY');
  return { ...result.data, projectUrl: parseProjectUrl(result.data.projectUrl).href };
}

/** Check every authored path component, not just its last filename. */
export async function localToyFile(base: string, value: string): Promise<string> {
  const absolute = path.resolve(base, value);
  let current = path.parse(absolute).root;
  try {
    for (const part of path.relative(current, absolute).split(path.sep)) {
      current = path.join(current, part);
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new BlogError(`作品源文件不允许符号链接：${value}`, 3, 'INVALID_TOY');
    }
    if (!(await lstat(absolute)).isFile()) throw new BlogError(`作品资源必须是普通文件：${value}`, 3, 'INVALID_TOY');
    return absolute;
  } catch (error) {
    if (error instanceof BlogError) throw error;
    throw new BlogError(`无法读取作品源文件：${value}`, 3, 'INVALID_TOY');
  }
}
export async function toyDigest(file: string) {
  await localToyFile(path.dirname(file), path.basename(file));
  const before = await lstat(file);
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  const after = await lstat(file);
  if (before.ino !== after.ino || before.dev !== after.dev || before.size !== bytes || after.size !== bytes || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new BlogError(`读取时源文件发生变化：${file}`, 4, 'SOURCE_CHANGED');
  return { hash: hash.digest('hex'), bytes };
}
async function newFile(file: string, value: string) {
  const temporary = `${file}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, value, { flag: 'wx', mode: 0o600 });
    // A hard-link commits the complete file atomically without replacing any
    // target another process may have created while the user was confirming.
    await link(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}
export async function readToyInput(root: string, file: string, overflow?: string): Promise<{ input: ToyInput; origin: Origin }> {
  const absolute = await localToyFile(root, file);
  if ((await lstat(absolute)).size > 1024 * 1024) throw new BlogError('作品资料文件超过 1 MiB。', 3, 'INVALID_TOY');
  const raw = await readFile(absolute, 'utf8');
  const value = parseYaml(raw, absolute);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BlogError('作品 YAML 须为字段映射。', 3, 'INVALID_TOY');
  const input = parseInput({ ...value, ...(overflow === undefined ? {} : { videoOverflow: overflow }) });
  return { input: { ...input, cover: await localToyFile(path.dirname(absolute), input.cover), video: await localToyFile(path.dirname(absolute), input.video) }, origin: { file: absolute, hash: sha256(raw) } };
}

export async function collectToyInput(root: string, options: CliOptions, prompts: PromptDriver): Promise<{ input: ToyInput; origin?: Origin }> {
  if (options.file) return readToyInput(root, options.file, options['video-overflow']);
  if (!prompts.enabled) throw new BlogError('非交互或 --json 模式须通过 --file 提供已填写的作品 YAML；--yes 不会补齐资料或授权裁剪。', 2, 'INPUT_REQUIRED');
  const nonempty = (value: string) => value.trim() ? true : '请输入非空内容。';
  const title = options.title ?? await prompts.input('作品名称', nonempty);
  const description = options.description ?? await prompts.input('作品简介（纯文字）', nonempty);
  const source = (value: string) => localToyFile(root, value.trim()).then(() => true as const).catch((error) => error.message as string);
  const cover = await prompts.input('本地封面文件路径', source);
  const video = await prompts.input('本地演示视频文件路径', source);
  const projectUrl = await prompts.input('项目公网 HTTP(S) 地址（稍后检查匿名访问）', (value) => { try { parseProjectUrl(value); return true; } catch (error) { return (error as Error).message; } });
  const videoOverflow = options['video-overflow'] ?? await prompts.select('未来压缩后超过 10 MB 时如何处理？当前不上传、不裁剪。', [{ name: '超限拒绝，不裁剪', value: 'reject' }, { name: '预先同意保留开头、删除尾部', value: 'trim-start' }]);
  const coverFit = await prompts.select('封面适配方式', [{ name: '铺满开口，允许裁切 · cover', value: 'cover' }, { name: '完整显示 · contain', value: 'contain' }]);
  const videoLabel = (await prompts.input('视频说明（可留空）', () => true)).trim();
  const input = parseInput({ title, description, cover, video, projectUrl, videoOverflow, coverFit, ...(videoLabel ? { videoLabel } : {}) });
  return { input: { ...input, cover: await localToyFile(root, cover), video: await localToyFile(root, video) } };
}

export async function inspectToyCover(file: string) {
  if (!/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(file)) throw new BlogError('封面须为 PNG、JPEG、WebP、GIF、AVIF 或 SVG。', 3, 'INVALID_TOY');
  const info = await sharp(file, { animated: true, limitInputPixels: 80_000_000 }).metadata();
  if (!info.width || !info.height || !info.format) throw new BlogError('封面缺少有效尺寸。', 3, 'INVALID_TOY');
  await sharp(file, { animated: true, limitInputPixels: 80_000_000 }).resize({ width: 1, height: 1, fit: 'inside' }).raw().toBuffer();
  return { width: info.width, height: info.pageHeight ?? info.height, format: info.format };
}
export async function inspectToyVideo(root: string, file: string) {
  if (!/\.(mp4|webm|mov|m4v)$/i.test(file)) throw new BlogError('视频须为 MP4、WebM、MOV 或 M4V。', 3, 'INVALID_TOY');
  const probe = JSON.parse((await run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm', '-print_format', 'json', '-show_format', '-show_streams', file], { cwd: root, code: 3, timeout: 120_000 })).stdout) as { format?: { format_name?: string; duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }> };
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const durationSeconds = Number(probe.format?.duration ?? video?.duration);
  const format = probe.format?.format_name ?? '';
  if (!video?.width || !video.height || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !/(?:^|,)(?:mov|mp4|matroska|webm)(?:,|$)/.test(format)) throw new BlogError('视频没有有效画面、时长或受支持的容器。', 3, 'INVALID_TOY');
  // Decode to the null sink to catch corrupt frames. No output or encoding.
  await run(['ffmpeg', '-v', 'error', '-xerror', '-nostdin', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm', '-i', file, '-map', '0:v:0', '-map', '0:a:0?', '-f', 'null', '-'], { cwd: root, code: 3, timeout: 120_000 });
  return { width: video.width, height: video.height, durationSeconds, format };
}

export async function prepareToy(root: string, input: ToyInput, origin?: Origin): Promise<ToyPlan> {
  const parsed = parseInput(input);
  const coverFile = await localToyFile(root, parsed.cover), videoFile = await localToyFile(root, parsed.video);
  const coverDigest = await toyDigest(coverFile), videoDigest = await toyDigest(videoFile);
  let cover, video;
  try { cover = await inspectToyCover(coverFile); video = await inspectToyVideo(root, videoFile); }
  catch (error) { throw new BlogError(`作品媒体校验失败：${error instanceof Error ? error.message : String(error)}`, 3, 'INVALID_TOY'); }
  const plan: ToyPlan = { input: { ...parsed, cover: coverFile, video: videoFile }, cover: { ...coverDigest, ...cover }, video: { ...videoDigest, ...video }, project: await checkProjectUrl(parsed.projectUrl), origin };
  await verifyToySources(plan);
  return plan;
}
export async function verifyToySources(plan: ToyPlan) {
  if (plan.origin && sha256(await readFile(await localToyFile(path.dirname(plan.origin.file), path.basename(plan.origin.file)), 'utf8')) !== plan.origin.hash) throw new BlogError('确认后作品填写文件发生变化，请重新录入。', 4, 'SOURCE_CHANGED');
  for (const key of ['cover', 'video'] as const) if (stableJson(await toyDigest(plan.input[key])) !== stableJson({ hash: plan[key].hash, bytes: plan[key].bytes })) throw new BlogError(`确认后作品 ${key} 源文件发生变化，请重新检查。`, 4, 'SOURCE_CHANGED');
}
export function toyReceipt(plan: ToyPlan) {
  return { title: plan.input.title, state: 'pending-media', project: plan.project, cover: plan.cover, video: plan.video, videoOverflow: plan.input.videoOverflow,
    processing: { maxOutputBytes: toyVideoLimit, outputBytes: null, retainedSeconds: null }, note: '待媒体处理；只保存本地资料与原文件引用，不上传、不进入舞台或公开集合。' };
}

export async function saveToy(root: string, plan: ToyPlan) {
  await verifyToySources(plan);
  const id = plan.input.id ?? randomUUID();
  await writingDirectory(root, 'content/toys');
  const directory = await writingPath(root, `content/toys/${id}`);
  try { await mkdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new BlogError(`作品 ID 已存在，拒绝覆盖：${id}`, 4, 'TOY_EXISTS'); throw error; }
  const file = path.join(directory, 'toy.yaml');
  try {
    const record = toyRecordSchema.parse({ ...plan.input, id, schemaVersion: 1, state: 'pending-media', createdAt: new Date().toISOString(),
      validation: { checkedAt: new Date().toISOString(), project: plan.project, cover: plan.cover, video: plan.video }, processing: toyReceipt(plan).processing });
    await newFile(file, stringify(record));
    return { ...toyReceipt(plan), id, file: path.relative(root, file).split(path.sep).join('/') };
  } catch (error) {
    // Remove only our empty reservation. Never remove a file created by another editor.
    await rmdir(directory).catch(() => {});
    throw error;
  }
}

export async function toyCatalogue(root: string) {
  const directory = await writingPath(root, 'content/toys');
  const toys: Array<{ id: string; title: string; file: string; state: 'pending-media' }> = [];
  const issues: Array<{ file: string; message: string }> = [];
  if (!await exists(directory)) return { toys, issues };
  if ((await lstat(directory)).isSymbolicLink()) throw new BlogError('作品资料目录不能是符号链接。', 3, 'INVALID_TOY');
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const file = await physicalSourcePath(root, `content/toys/${entry.name}/toy.yaml`);
    try {
      if (!entry.isDirectory() || !z.uuid().safeParse(entry.name).success) throw new BlogError('作品目录必须是 UUID 普通目录。');
      const record = await readToyRecord(root, entry.name);
      toys.push({ id: record.id, title: record.title, file, state: record.state });
    } catch (error) { issues.push({ file, message: error instanceof Error ? error.message : String(error) }); }
  }
  return { toys, issues };
}
export async function readToyRecord(root: string, id: string): Promise<ToyRecord> {
  if (!z.uuid().safeParse(id).success) throw new BlogError('toy check 需要完整作品 UUID。', 2, 'INPUT_REQUIRED');
  const file = await localToyFile(root, await physicalSourcePath(root, `content/toys/${id.toLowerCase()}/toy.yaml`));
  if ((await lstat(file)).size > 1024 * 1024) throw new BlogError('作品资料文件超过 1 MiB。', 3, 'INVALID_TOY');
  const record = toyRecordSchema.parse(parseYaml(await readFile(file, 'utf8'), file));
  if (record.id !== id.toLowerCase()) throw new BlogError('作品 ID 与目录不一致。', 3, 'INVALID_TOY');
  return record;
}
export async function checkToy(root: string, id: string) {
  const record = await readToyRecord(root, id);
  const changes = await Promise.all((['cover', 'video'] as const).map(async (key) => ({ key, current: await toyDigest(record[key]) })));
  const changedSources = changes.filter(({ key, current }) => current.hash !== record.validation[key].hash);
  if (changedSources.length) throw new BlogError(`作品源文件已变化：${changedSources.map(({ key }) => key).join('、')}。登记摘要未修改；未继续联网与解码检查。`, 3, 'SOURCE_CHANGED', {
    id: record.id, file: await physicalSourcePath(root, `content/toys/${record.id}/toy.yaml`), state: record.state,
    changed: changedSources.map(({ key, current }) => ({ field: key, registered: record.validation[key].hash, current })), processing: record.processing,
  });
  const input = toyInputSchema.parse(Object.fromEntries(Object.keys(fields).map((key) => [key, record[key as keyof ToyRecord]])));
  const current = await prepareToy(root, input);
  const changed = (['cover', 'video'] as const).filter((key) => current[key].hash !== record.validation[key].hash);
  const result = { ...toyReceipt(current), id: record.id, file: await physicalSourcePath(root, `content/toys/${record.id}/toy.yaml`), changed, checkedAt: new Date().toISOString(), registeredAt: record.validation.checkedAt };
  if (changed.length) throw new BlogError(`作品源文件已变化：${changed.join('、')}。登记摘要未修改；未来媒体处理前必须重新核对。`, 3, 'SOURCE_CHANGED', result);
  return result;
}

export async function templateTarget(root: string, output: string, create = false) {
  const target = path.resolve(root, output);
  if (await exists(target)) throw new BlogError(`模板目标已存在，拒绝覆盖：${target}`, 4, 'TOY_EXISTS');
  let parent = path.dirname(target);
  const missing: string[] = [];
  while (!await exists(parent)) { missing.unshift(path.basename(parent)); parent = path.dirname(parent); }
  if ((await lstat(parent)).isSymbolicLink()) throw new BlogError('模板父目录不能是符号链接。', 3, 'INVALID_TOY');
  if (!(await lstat(parent)).isDirectory()) throw new BlogError('模板父目录必须是普通目录。', 3, 'INVALID_TOY');
  let current = path.parse(parent).root;
  for (const part of path.relative(current, parent).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new BlogError('模板父目录不能包含符号链接。', 3, 'INVALID_TOY');
  }
  if (create && missing.length) await safeDirectory(parent, missing.join('/'));
  return target;
}
export async function saveToyTemplate(root: string, output: string) {
  const file = await templateTarget(root, output, true);
  try { await newFile(file, toyTemplate); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new BlogError('模板目标刚被创建，拒绝覆盖。', 4, 'TOY_EXISTS'); throw error; }
  return { file, note: '填写模板；尚未登记作品，不生成作品 ID，不上传媒体。' };
}
