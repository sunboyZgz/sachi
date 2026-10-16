import type { BlogPost } from '../../../src/lib/blog/schema';
import type { profileSchema } from '../../../src/config/profile-schema';
import type { z } from 'zod';
import type { SourceOrigin, SourcePoint } from '../../../src/lib/source-lines';
import type { ArticleStyles } from './style-audit';
import type { ImageWindow } from '../../../src/lib/image-window';

export type RevealLine = {
  type: 'revealLine'; document: string; version: number; sequence: number;
  line: number; column: number; reason: 'cursor' | 'scroll' | 'manual';
};
export type NavigationReceipt = {
  document: string; version: number; sequence: number; requestedLine: number; matchedLine: number;
  reason: RevealLine['reason']; visible: boolean; scrollTop: number; kind: string; text: string;
};

export type PreviewData = {
  type: 'update'; layoutMode?: 'responsive' | 'desktop'; revision: number; document: string; dirty: boolean;
  post: BlogPost; profile: z.input<typeof profileSchema>;
  warnings: string[]; styles: string[]; avatar: string;
  source: { origin: SourceOrigin; version: number; totalLines: number; syncEnabled: boolean; clickEnabled: boolean; title?: SourcePoint; navigation?: RevealLine };
};
export type RevealSource = { type: 'revealSource'; document: string; revision: number; version: number; sequence: number; line: number; column: number };
export type SetImageWindow = Omit<RevealSource, 'type'> & { type: 'setImageWindow'; reference: string; window: ImageWindow | null };
export type ImageWindowReceipt = { document: string; sequence: number; accepted: boolean; message: string };
export type SourceNavigationReceipt = RevealSource & { accepted: boolean; navigationSequence: number };
export type PreviewTestClick = { image?: boolean; selector?: string; text: string; occurrence?: number; offset?: number; gesture?: 'click' | 'drag' | 'right' };
export type PreviewTestReceipt = { sequence: number; scrollTop: number; selectionCollapsed: boolean; found: boolean };
export type RenderMessage = PreviewData | { type: 'error'; revision: number; message: string };
export type HostMessage = RenderMessage | RevealLine | { type: 'sync'; enabled: boolean; clickEnabled: boolean } | { type: 'sourceResult'; receipt: SourceNavigationReceipt } | { type: 'imageWindowResult'; receipt: ImageWindowReceipt } | { type: 'inspectCodeStyles'; sequence: number } | { type: 'testPreviewClick'; sequence: number; action: PreviewTestClick };
export type CodeStyleReceipt = {
  revision: number; sequence: number; theme: string; scrollTop: number;
  article: ArticleStyles;
  layoutMode: string; bodyWidth: number; flows: Array<{ layout: string; engine: string; width: number; height: number; status: string }>;
  blocks: Array<{ language: string; text: string; color: string; background: string; tokens: Record<string, string> }>;
  inline: Array<{ text: string; color: string; parentColor: string }>;
  cropEditorOpen: boolean;
  images: Array<{ src: string; width: number; height: number; naturalWidth: number; naturalHeight: number; centerX: number; cropped: boolean }>;
};
export type RenderReceipt = { revision: number; title: string; text: string; flow: boolean };
export type ViewMessage = { type: 'toggleLayout' } | { type: 'ready' } | { type: 'openLink'; href: string } | { type: 'rendered'; receipt: RenderReceipt } | { type: 'revealed'; receipt: NavigationReceipt } | { type: 'codeStyles'; receipt: CodeStyleReceipt } | { type: 'previewClickTested'; receipt: PreviewTestReceipt } | RevealSource | SetImageWindow;
