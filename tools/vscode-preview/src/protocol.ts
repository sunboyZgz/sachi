import type { BlogPost } from '../../../src/lib/blog/schema';
import type { profileSchema } from '../../../src/config/profile-schema';
import type { z } from 'zod';

export type PreviewData = {
  type: 'update'; revision: number; document: string; dirty: boolean;
  post: BlogPost; profile: z.infer<typeof profileSchema>;
  warnings: string[]; styles: string[]; avatar: string;
};
export type HostMessage = PreviewData | { type: 'error'; revision: number; message: string };
export type RenderReceipt = { revision: number; title: string; text: string; flow: boolean };
export type ViewMessage = { type: 'ready' } | { type: 'openLink'; href: string } | { type: 'rendered'; receipt: RenderReceipt };
