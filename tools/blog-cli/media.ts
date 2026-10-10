import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BlogError, sha256, stableJson } from '../../src/lib/blog/files';
import { type Asset, type BlogConfig, type Snapshot } from '../../src/lib/blog/schema';
import { storePath } from './config';
import { immutableWrite } from './snapshot';
import { run } from './process';
import { createImageContour, imageDimensions } from '../../src/lib/blog/flow-assets';

async function mediaOperation<T>(description: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof BlogError) throw error;
    throw new BlogError(`${description}失败：${error instanceof Error ? error.message : String(error)}`, 3);
  }
}
export async function validateMedia(root: string, config: BlogConfig, dependencies: Array<{ url: string; sourceFile: string }>, flowImage?: string) {
  return await mediaOperation('媒体检查', () => inspectMedia(root, config, dependencies, flowImage));
}
async function inspectMedia(root: string, config: BlogConfig, dependencies: Array<{ url: string; sourceFile: string }>, flowImage?: string) {
  const checked = [];
  for (const dependency of dependencies) {
    const extension = path.extname(dependency.sourceFile).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg'].includes(extension)) {
      const info = await sharp(dependency.sourceFile, { animated: true, limitInputPixels: 80_000_000 }).metadata();
      if (!info.width || !info.height) throw new BlogError(`图片缺少有效尺寸：${dependency.url}`);
      if (dependency.url === flowImage && info.orientation && info.orientation !== 1) throw new BlogError(`环绕图包含 EXIF 旋转，须先显式修正图片和轮廓：${dependency.url}`);
      if (dependency.url === flowImage && (info.pages ?? 1) > 1) throw new BlogError(`环绕图片必须是静态图片：${dependency.url}`);
      if (dependency.url === flowImage) await createImageContour(await readFile(dependency.sourceFile));
      checked.push({ url: dependency.url, width: info.width, height: info.height, frames: info.pages ?? 1 });
    } else if (['.mp4', '.webm', '.mov', '.m4v'].includes(extension)) {
      await run(['ffmpeg', '-version'], { cwd: root, code: 3 });
      const probe = JSON.parse((await run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', dependency.sourceFile], { cwd: root, code: 3 })).stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type: string }> };
      const duration = Number(probe.format?.duration);
      if (!probe.streams?.some((stream) => stream.codec_type === 'video') || !Number.isFinite(duration) || duration <= 0 || duration > config.media.maxVideoSeconds) throw new BlogError(`视频无效或超过 ${config.media.maxVideoSeconds} 秒：${dependency.url}`);
      checked.push({ url: dependency.url, duration });
    }
  }
  return checked;
}

export async function prepareMedia(root: string, config: BlogConfig, snapshot: Snapshot, publicRoot: string) {
  return await mediaOperation(`文章「${snapshot.post.title}」媒体转换`, () => transformMedia(root, config, snapshot, publicRoot));
}
async function transformMedia(root: string, config: BlogConfig, snapshot: Snapshot, publicRoot: string) {
  const assets: Record<string, Asset> = {};
  for (const dependency of snapshot.dependencies) {
    const input = path.join(storePath(root, 'snapshots', snapshot.revisionHash), 'files', dependency.file);
    const extension = path.extname(dependency.file).toLowerCase();
    const bytes = await readFile(input); const preset = snapshot.media.assets[dependency.url];
    const isFlow = dependency.url === snapshot.post.flow?.image;
    const write = async (output: Buffer, ext: string) => {
      const url = `/media/${snapshot.post.id}/${sha256(output)}${ext}`;
      await immutableWrite(path.join(publicRoot, url.slice(1)), output);
      return url;
    };
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg'].includes(extension)) {
      const metadata = await sharp(bytes, { animated: true, limitInputPixels: 80_000_000 }).metadata();
      if (isFlow && metadata.orientation && metadata.orientation !== 1) throw new BlogError(`环绕图包含 EXIF 旋转，不能静默改变轮廓：${dependency.url}`);
      if (extension === '.gif' || (metadata.pages ?? 1) > 1) {
        assets[dependency.url] = { url: await write(bytes, extension), type: 'image', width: metadata.width, height: metadata.pageHeight ?? metadata.height };
      } else if (isFlow || metadata.hasAlpha || preset?.preset === 'flow' || preset?.preset === 'original' || preset?.preset === 'screenshot') {
        const output = isFlow ? await sharp(bytes).png().toBuffer() : await sharp(bytes).rotate().png().toBuffer();
        const dimensions = await sharp(output).metadata();
        assets[dependency.url] = { url: await write(output, '.png'), type: 'image', width: dimensions.width, height: dimensions.height };
      } else {
        const outputs: Array<{ width: number; url: string; height: number }> = [];
        for (const width of [...new Set(preset?.widths ?? [640, 1280, 1920])].sort((a, b) => a - b)) {
          const { data, info } = await sharp(bytes).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: preset?.quality ?? 85 }).toBuffer({ resolveWithObject: true });
          if (!outputs.some((o) => o.width === info.width)) outputs.push({ width: info.width, height: info.height, url: await write(data, '.webp') });
        }
        const largest = outputs.at(-1)!;
        assets[dependency.url] = { type: 'image', url: largest.url, width: largest.width, height: largest.height, srcSet: outputs.map((o) => `${o.url} ${o.width}w`).join(', ') };
      }
      if (isFlow) {
        Object.assign(assets[dependency.url], await imageDimensions(bytes, true));
        if (!snapshot.post.flow?.contour) assets[dependency.url].contour = await write(Buffer.from(JSON.stringify(await createImageContour(bytes))), '.json');
      }
    } else if (['.mp4', '.webm', '.mov', '.m4v'].includes(extension)) {
      const probe = JSON.parse((await run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input], { cwd: root, code: 3 })).stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }> };
      const duration = Number(probe.format?.duration); const video = probe.streams?.find((stream) => stream.codec_type === 'video');
      if (!video || !Number.isFinite(duration) || duration <= 0 || duration > config.media.maxVideoSeconds) throw new BlogError(`短视频无效或超过 ${config.media.maxVideoSeconds} 秒：${dependency.url}`);
      const version = (await run(['ffmpeg', '-version'], { cwd: root, code: 3 })).stdout.split('\n')[0];
      const key = sha256(stableJson({ source: dependency.hash, version, preset: 'h264-yuv420p-crf23-aac-v1' }));
      const cache = path.join(root, '.blog', 'cache', 'video', key); await mkdir(cache, { recursive: true });
      const output = path.join(cache, 'video.mp4'); const poster = path.join(cache, 'poster.jpg');
      await run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', '-map_metadata', '-1', output], { cwd: root, code: 3 });
      await run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', output, '-frames:v', '1', '-q:v', '2', poster], { cwd: root, code: 3 });
      assets[dependency.url] = { type: 'video', url: await write(await readFile(output), '.mp4'), poster: await write(await readFile(poster), '.jpg'), width: video.width, height: video.height };
    } else assets[dependency.url] = { type: 'file', url: await write(bytes, extension) };
  }
  for (const [url, preset] of Object.entries(snapshot.media.assets)) if (preset.poster && assets[url]?.type === 'video') assets[url].poster = assets[preset.poster]?.url;
  return assets;
}
