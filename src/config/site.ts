import { profile } from './profile';
export { profile, brandArtwork } from './profile';
export const identity = profile;

export function siteAsset(url: string) { return `${process.env.NEXT_PUBLIC_BLOG_ASSET_PREFIX ?? ''}${url}`; }
export const categories = [
  { id: 'play', name: '闲暇娱乐', number: '01', image: siteAsset('/assets/project-detail.webp') },
  { id: 'life', name: '生活旁白', number: '02', image: siteAsset('/assets/life-detail.webp') },
  { id: 'learn', name: '蘸豆！！', number: '03', image: siteAsset('/assets/notes-detail.webp') },
] as const;

export type CategoryId = (typeof categories)[number]['id'];

export const categoryIds = categories.map((category) => category.id);
export const categoryById = new Map(categories.map((category) => [category.id, category]));
export const postsPerPage = 3;

export function getCategory(id: string) {
  return categoryById.get(id as CategoryId);
}

export function dateLabel(date: string) {
  return date.replaceAll('-', '.');
}
