import type { CategoryId } from '@/config/site';
import { PaginationControls } from './PaginationControls';

export function Pagination({ category, current, total }: { category: CategoryId; current: number; total: number }) {
  if (total <= 1) return null;
  // Pass public build values from the server; never import SiteLink's server-only
  // release-mode decision into a client bundle or use RSC for static pagination.
  const basePath = process.env.NEXT_PUBLIC_BLOG_BASE_PATH ?? '';
  return <PaginationControls key={`${category}/${current}/${total}`} context={{ category, current, total, basePath,
    scope: `${basePath}|${process.env.NEXT_PUBLIC_BLOG_ASSET_PREFIX ?? 'working'}` }} />;
}
