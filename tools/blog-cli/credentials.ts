import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BlogError } from '../../src/lib/blog/files';
import type { BlogConfig } from '../../src/lib/blog/schema';

const uploadCredentialSchema = z.strictObject({
  schemaVersion: z.literal(1),
  uploadKey: z.string().min(1).max(16_384).refine((value) => !/[\s\x00-\x1f\x7f]/.test(value)),
});

export function uploadCredentialPath(root: string, filename: string): string {
  if (!filename || /[\x00-\x1f]/.test(filename)) throw new BlogError('凭证配置文件路径无效。', 2);
  const file = path.resolve(root, filename);
  const relative = path.relative(root, file);
  // Private configuration must never enter code snapshots, public output or the
  // nested writing backup. External private files are also supported.
  if ((!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) && !relative.startsWith(`.sachi${path.sep}`)) {
    throw new BlogError('项目内凭证配置只能放在忽略的 .sachi/ 目录；也可使用项目外的私密文件。', 2);
  }
  return file;
}

export function loadUploadCredential(root: string, config: NonNullable<BlogConfig['yandu']>): string {
  const file = uploadCredentialPath(root, config.credentialFile);
  let raw: string;
  try {
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) throw new Error('invalid file');
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new BlogError('无法读取 Yandu 凭证配置文件；不使用环境变量覆盖错误配置。', 2, 'INVALID_CONFIG');
    const fallback = process.env[config.credentialEnv];
    if (!uploadCredentialSchema.shape.uploadKey.safeParse(fallback).success) throw new BlogError(`凭证配置文件不存在，且保底环境变量 ${config.credentialEnv} 未提供有效密钥。请填写 .sachi/yandu-upload.json。`, 2, 'INPUT_REQUIRED');
    return fallback!;
  }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new BlogError('Yandu 凭证配置文件不是有效 JSON；不回退到环境变量。', 2, 'INVALID_CONFIG'); }
  const result = uploadCredentialSchema.safeParse(value);
  if (!result.success) throw new BlogError('Yandu 凭证配置文件需要 schemaVersion: 1 和非空 uploadKey，且不能含未知字段；不回退到环境变量。', 2, 'INVALID_CONFIG');
  return result.data.uploadKey;
}
