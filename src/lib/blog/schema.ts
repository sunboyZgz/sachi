import { z } from 'zod';
import { imageWindowsSchema } from '../image-window';

export const categoryNames = { play: '闲暇娱乐', life: '生活旁白', learn: '蘸豆！！' } as const;
export const categorySchema = z.enum(['play', 'life', 'learn']);
export const articleTypeSchema = z.enum(['article', 'poem']);
export type ArticleType = z.infer<typeof articleTypeSchema>;
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const sourcePathSchema = z.string().startsWith('content/').endsWith('.md').refine((value) => !value.includes('\\') && !value.includes('\0') && value.split('/').every((part) => part !== '..' && part !== '.' && part.length > 0));
export const releaseIdSchema = z.string().regex(/^r-[a-zA-Z0-9-]{8,80}$/);
export const flowSpecSchema = z.object({
  image: z.string().min(1), contour: z.string().min(1).optional(),
  width: z.number().finite().min(96).max(360).optional(),
  alt: z.string().trim().min(1).max(300).optional(),
  defaultX: z.number().min(0).max(1).default(0.53),
  defaultY: z.number().finite().nonnegative().default(86),
});
export type FlowSpec = z.infer<typeof flowSpecSchema>;
export const flowSchema = z.union([flowSpecSchema, z.array(flowSpecSchema).min(1)]);
export type FlowConfig = FlowSpec | FlowSpec[];
export function flowSpecs(flow?: FlowConfig): FlowSpec[] { return flow ? Array.isArray(flow) ? flow : [flow] : []; }

export const assetSchema = z.object({
  url: z.string(), type: z.enum(['image', 'video', 'file']),
  srcSet: z.string().optional(), poster: z.string().optional(),
  contour: z.string().optional(),
  width: z.number().finite().positive().optional(), height: z.number().finite().positive().optional(),
  originalWidth: z.number().finite().positive().optional(), originalHeight: z.number().finite().positive().optional(),
});
export type Asset = z.infer<typeof assetSchema>;
const idSchema = z.string().regex(/^(?:legacy-[a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i);
const slugSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/);
export const seriesRefSchema = z.object({ id: z.string().uuid(), order: z.number().int().positive().safe() });
export const seriesSchema = z.object({
  id: z.string().uuid(), slug: slugSchema, title: z.string().trim().min(1), category: categorySchema,
  description: z.string().optional(),
});
export type Series = z.infer<typeof seriesSchema>;
export const postSchema = z.object({
  id: idSchema, slug: slugSchema,
  title: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.string().datetime({ offset: true }), category: categorySchema, body: z.string(),
  publishedAt: z.string().datetime({ offset: true }).optional(), updatedAt: z.string().datetime({ offset: true }).optional(),
  featured: z.boolean().default(false), fixture: z.boolean().default(false),
  tags: z.array(z.string().min(1)).default([]), status: z.string().optional(),
  minutes: z.number().int().positive(), summary: z.string().optional(),
  cover: z.string().optional(), flow: flowSchema.optional(),
  imageWindows: imageWindowsSchema.optional(),
  type: articleTypeSchema.optional(),
  assets: z.record(z.string(), assetSchema).default({}),
  series: seriesRefSchema.optional(),
}).superRefine((post, context) => {
  if (post.type === 'poem' && post.flow !== undefined) context.addIssue({ code: 'custom', path: ['flow'], message: '诗歌模式暂不支持 flow 环绕；请删除 flow 或切换为 article。' });
});
export type BlogPost = z.infer<typeof postSchema>;

export const mediaPresetSchema = z.object({
  preset: z.enum(['photo', 'screenshot', 'original', 'flow']).default('photo'),
  quality: z.number().int().min(1).max(100).default(85),
  widths: z.array(z.number().int().min(1).max(4096)).min(1).max(8).default([640, 1280, 1920]),
  poster: z.string().optional(),
});
export const mediaSchema = z.object({ assets: z.record(z.string(), mediaPresetSchema).default({}) });
export type MediaSpec = z.infer<typeof mediaSchema>;
export const dependencySchema = z.object({ url: z.string(), file: z.string().startsWith('assets/').refine((value) => !value.includes('\\') && !value.includes('\0') && !value.split('/').includes('..')), hash: hashSchema, bytes: z.number().int().nonnegative() });
export type Dependency = z.infer<typeof dependencySchema>;
export const snapshotSchema = z.object({
  schemaVersion: z.literal(1), revisionHash: hashSchema,
  sourcePath: sourcePathSchema, sourceHash: hashSchema, post: postSchema, dependencies: z.array(dependencySchema), media: mediaSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const entrySchema = z.object({
  id: idSchema, slug: slugSchema, title: z.string(), category: categorySchema,
  revisionHash: hashSchema, sourcePath: sourcePathSchema, publishedAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
  gitCommit: z.string().nullable().default(null),
  series: seriesRefSchema.optional(),
});
export type ReleaseEntry = z.infer<typeof entrySchema>;
export const seriesEntrySchema = seriesSchema.omit({ description: true }).extend({
  revisionHash: hashSchema, publishedAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
});
export type SeriesEntry = z.infer<typeof seriesEntrySchema>;
export const seriesSnapshotSchema = z.object({
  schemaVersion: z.literal(1), revisionHash: hashSchema, sourceHash: hashSchema,
  sourcePath: z.string().regex(/^content\/series\/[a-f0-9-]{36}\.yaml$/i), series: seriesSchema,
});
export type SeriesSnapshot = z.infer<typeof seriesSnapshotSchema>;
export const manifestSchema = z.object({
  schemaVersion: z.literal(1), releaseId: releaseIdSchema,
  baseReleaseId: releaseIdSchema.nullable(), createdAt: z.string(),
  codeHash: hashSchema, codeCommit: z.string().nullable(),
  entries: z.array(entrySchema), withdrawn: z.array(idSchema), retired: z.array(entrySchema).default([]),
  assets: z.record(z.string(), z.record(z.string(), assetSchema)).default({}),
  series: z.array(seriesEntrySchema).optional(),
});
export type Manifest = z.infer<typeof manifestSchema>;

export const configSchema = z.object({
  schemaVersion: z.literal(1), timezone: z.string(),
  contentDir: z.literal('content').default('content'),
  siteUrl: z.string().url().refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && /^\/(?:[a-zA-Z0-9_~.-]+\/?)*$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password;
  }, 'siteUrl 必须是无查询参数或登录信息的 HTTP(S) 站点地址；允许 GitHub Pages 仓库子路径。').nullable().default(null),
  codeRef: z.string().min(1).nullable().default(null),
  devCommand: z.array(z.string()).min(1).default(['node', 'node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', '4173']),
  buildCommand: z.array(z.string()).min(1).default(['node', 'node_modules/next/dist/bin/next', 'build', '--webpack']),
  siteAssets: z.array(z.string()).default([
    'assets/favicon.svg', 'assets/brand-title-study.svg', 'assets/signature-study.svg',
    'assets/desk-scene.webp', 'assets/desk-scene-mobile.webp',
    'assets/project-detail.webp', 'assets/life-detail.webp', 'assets/notes-detail.webp',
  ]),
  media: z.object({ maxVideoSeconds: z.number().positive().default(180), maxGitFileMiB: z.number().min(1).max(100).default(100) }).default({ maxVideoSeconds: 180, maxGitFileMiB: 100 }),
  git: z.object({ remote: z.string().min(1), branch: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).default('content-source'), visibility: z.enum(['unconfirmed', 'private', 'public']).default('unconfirmed') }).nullable().default(null),
  pages: z.object({
    remote: z.string().min(1).nullable().default(null),
    branch: z.literal('blog').default('blog'),
  }).nullable().default(null),
  deploy: z.discriminatedUnion('type', [
    z.object({ type: z.literal('local'), root: z.string().min(1) }),
    z.object({ type: z.literal('ssh'), host: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/), root: z.string().regex(/^\/[a-zA-Z0-9_/-]+$/) }),
  ]).nullable().default(null),
});
export type BlogConfig = z.infer<typeof configSchema>;
export function defaultConfig(timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): BlogConfig {
  return configSchema.parse({ schemaVersion: 1, timezone });
}
