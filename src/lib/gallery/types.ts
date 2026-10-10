export type GalleryRect = readonly [number, number, number, number];
export type GalleryFrame = {
  id: string;
  kind: string;
  size: readonly [number, number];
  frame: string;
  silhouette: string;
  cover: GalleryRect;
  number: GalleryRect;
  title: GalleryRect;
};
export type GallerySlot = { frame: string; rect: GalleryRect };
export type GalleryItem = {
  id: string;
  title: string;
  cover: string;
  coverFit?: 'contain' | 'cover';
  coverPosition?: readonly [number, number];
  description?: string;
  video?: string | null;
  videoLabel?: string;
  projectUrl?: string | null;
  demoOnly?: boolean;
};
