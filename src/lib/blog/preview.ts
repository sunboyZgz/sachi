import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SourcePost } from './content';
import { type BlogPost, type Series } from './schema';
import { scanSeries } from './series';
import { atomicWrite, BlogError, safeDirectory, safeFile, sha256 } from './files';
import { createImageContour, imageDimensions } from './flow-assets';

export async function previewPosts(root: string, sources: SourcePost[], definitions?: Series[]): Promise<BlogPost[]> {
  const ids = new Map(sources.map((source) => [source.post.id, source.post.slug]));
  const catalogue = definitions ?? (await scanSeries(root)).series.map((source) => source.series);
  const active = new Set(sources.flatMap((source) => source.post.series ? [source.post.series.id] : []));
  return await Promise.all(sources.map(async (source) => {
    const assets: BlogPost['assets'] = {};
    for (const dep of source.dependencies) {
      const extension = path.extname(dep.file).toLowerCase();
      const url = `/media/${source.post.id}/${dep.hash}${extension}`;
      const target = path.join(root, 'public', url.slice(1));
      const bytes = await readFile(await safeFile(root, path.relative(root, dep.sourceFile)));
      if (sha256(bytes) !== dep.hash) throw new BlogError(`预览资源在读取期间发生变化：${dep.url}`, 4);
      await safeDirectory(root, path.relative(root, path.dirname(target))); await atomicWrite(target, bytes);
      assets[dep.url] = { url, type: ['.mp4', '.webm', '.mov', '.m4v'].includes(extension) ? 'video' : ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.gif'].includes(extension) ? 'image' : 'file' };
      if (assets[dep.url].type === 'image') {
        const isFlow = dep.url === source.post.flow?.image;
        Object.assign(assets[dep.url], await imageDimensions(bytes, isFlow));
        if (isFlow && !source.post.flow?.contour) {
          const contour = Buffer.from(JSON.stringify(await createImageContour(bytes)));
          const contourUrl = `/media/${source.post.id}/${sha256(contour)}.json`;
          await atomicWrite(path.join(root, 'public', contourUrl.slice(1)), contour);
          assets[dep.url].contour = contourUrl;
        }
      }
    }
    for (const [id, slug] of ids) assets[`blog:${id}`] = { url: `/article/${slug}/`, type: 'file' };
    for (const series of catalogue) if (active.has(series.id)) assets[`series:${series.id}`] = { url: `/series/${series.slug}/`, type: 'file' };
    return mappedPost(source.post, assets);
  }));
}
export function mappedPost(post: BlogPost, assets: BlogPost['assets']): BlogPost {
  return { ...post, assets, cover: post.cover ? assets[post.cover]?.url ?? post.cover : undefined,
    flow: post.flow ? { ...post.flow, image: assets[post.flow.image]?.url ?? post.flow.image,
      contour: post.flow.contour ? assets[post.flow.contour]?.url ?? post.flow.contour : assets[post.flow.image]?.contour } : undefined };
}
