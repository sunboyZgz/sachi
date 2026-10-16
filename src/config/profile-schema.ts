import { z } from 'zod';

const publicUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}, '只接受不含登录信息的 HTTP(S) 公开地址。');

const aboutSchema = z.strictObject({
  introduction: z.array(z.string().trim().min(1).max(2000)).max(10).default([]),
  interests: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  updates: z.array(z.strictObject({ text: z.string().trim().min(1).max(500), date: z.iso.date() })).max(30).default([]),
  links: z.array(z.strictObject({ label: z.string().trim().min(1).max(60), url: publicUrl })).max(10).default([]),
});

export const profileSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  signature: z.string().trim().min(1).max(200),
  bio: z.string().trim().min(1).max(500),
  homeLabel: z.string().trim().min(1).max(50),
  copyrightStartYear: z.number().int().min(1900).max(9999),
  authorUrl: publicUrl.nullable(),
  sameAs: z.array(publicUrl).max(10),
  about: aboutSchema.prefault({}),
  seo: z.strictObject({ description: z.string().trim().min(1).max(300).nullable(), allowIndexing: z.boolean() }),
});
