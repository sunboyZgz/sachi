import { z } from 'zod';

// Public immutable identity only: credentials and local paths never belong here.
const storageId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
export const resourceRefSchema = z.strictObject({
  projectId: storageId, objectId: storageId, versionId: storageId,
  sha256: z.string().regex(/^[a-f0-9]{64}$/), mime: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
  bytes: z.number().int().nonnegative().safe(),
  width: z.number().int().positive().optional(), height: z.number().int().positive().optional(),
  duration: z.number().positive().optional(),
});
export type ResourceRef = z.infer<typeof resourceRefSchema>;
export function resourceUrl(ref: ResourceRef) {
  return `/resources/${ref.sha256}/${encodeURIComponent(ref.objectId)}/${encodeURIComponent(ref.versionId)}`;
}
export const yanduConfigSchema = z.strictObject({
  gateway: z.string().url().refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
  }, '填写网关根地址，不含密钥或 /storage/v1。'),
  projectId: storageId,
  credentialFile: z.string().min(1).max(4096).refine((value) => !/[\x00-\x1f]/.test(value), '凭证文件路径不能包含控制字符。').default('.sachi/yandu-upload.json'),
  credentialEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/).refine((value) => !value.startsWith('NEXT_PUBLIC_') && !['PATH', 'HOME', 'USER', 'SHELL', 'NODE_ENV', 'NODE_OPTIONS', 'CODEX_HOME'].includes(value), '使用专用的服务端凭证环境变量，不能使用公开或系统变量。').default('YANDU_UPLOAD_KEY'),
});
