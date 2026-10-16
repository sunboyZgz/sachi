import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getWritingActivity } from './activity';
import { calendarStats } from '../writing-calendar';

let root: string;
const publicEntry = {
  id: `legacy-${'a'.repeat(24)}`, slug: 'public-post', title: '已冻结的公开标题', category: 'learn',
  sourcePath: 'content/public.md', revisionHash: 'a'.repeat(64),
  publishedAt: '2026-10-14T16:30:00Z', updatedAt: '2026-10-15T08:00:00Z',
};
const manifest = () => ({ schemaVersion: 1, releaseId: 'r-test-calendar', baseReleaseId: null,
  createdAt: '2026-10-15T09:00:00Z', codeHash: 'a'.repeat(64), codeCommit: null, entries: [publicEntry], withdrawn: [], retired: [], assets: {} });

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'sachi-writing-calendar-'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
  vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('BLOG_CONTENT_MODE', 'working'); vi.stubEnv('INCLUDE_FIXTURES', 'false'); vi.stubEnv('BLOG_TIMEZONE', 'Asia/Shanghai');
  await mkdir(path.join(root, 'content'));
  await writeFile(path.join(root, 'content/private.md'), '---\ntitle: 不可公开的草稿标题\ndate: 2026-10-15\ncategory: learn\n---\n\n私人正文。');
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });

describe('calendar publication isolation', () => {
  it('shows zero activity without a public manifest even when drafts exist', async () => {
    const result = await getWritingActivity();
    expect(result.posts).toEqual([]);
    expect(result.asOf).toBeNull();
  });

  it('uses frozen public metadata and ignores working revisions and withdrawn entries', async () => {
    await mkdir(path.join(root, '.blog-store'));
    await writeFile(path.join(root, '.blog-store/current.json'), JSON.stringify({ manifest: { ...manifest(), retired: [{ ...publicEntry, id: `legacy-${'b'.repeat(24)}`, title: '已撤回' }] } }));
    const result = await getWritingActivity();
    expect(result.posts).toEqual([{ id: publicEntry.id, slug: publicEntry.slug, title: publicEntry.title, category: 'learn', date: '2026-10-15' }]);
    expect(result.asOf).toBe('2026-10-15');
    expect(JSON.stringify(result)).not.toContain('草稿');
    expect(JSON.stringify(result)).not.toContain('已撤回');
  });

  it('reads only the explicitly frozen manifest during a production build', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('BLOG_CONTENT_MODE', 'release');
    const frozen = path.join(root, 'frozen.json');
    vi.stubEnv('BLOG_RELEASE_MANIFEST', frozen);
    await writeFile(frozen, JSON.stringify(manifest()));
    expect((await getWritingActivity()).posts.map((post) => post.title)).toEqual(['已冻结的公开标题']);
    vi.stubEnv('BLOG_RELEASE_MANIFEST', '');
    await expect(getWritingActivity()).rejects.toThrow('缺少发布清单');
  });

  it('cannot silently use a working directory for a production calendar', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(getWritingActivity()).rejects.toThrow('必须使用发布清单');
  });

  it('automatically recomputes activity after publishing or withdrawing, without counting article edits as new publications', async () => {
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    await mkdir(path.join(root, '.blog-store'));
    const currentFile = path.join(root, '.blog-store/current.json');
    await writeFile(currentFile, JSON.stringify({ manifest: manifest() }));
    expect(calendarStats((await getWritingActivity()).posts, 2026)).toEqual({ posts: 1, days: 1 });

    const second = { ...publicEntry, id: `legacy-${'b'.repeat(24)}`, slug: 'second-post', title: '新发布文章', publishedAt: '2026-10-16T02:00:00Z', updatedAt: '2026-10-16T02:00:00Z' };
    const updated = { ...manifest(), createdAt: '2026-10-16T09:00:00Z', entries: [{ ...publicEntry, updatedAt: '2026-10-16T08:00:00Z' }, second] };
    await writeFile(currentFile, JSON.stringify({ manifest: updated }));
    const result = await getWritingActivity();
    expect(calendarStats(result.posts, 2026)).toEqual({ posts: 2, days: 2 });
    expect(result.posts.find((post) => post.id === publicEntry.id)?.date).toBe('2026-10-15');
    expect(result.posts.find((post) => post.id === second.id)?.date).toBe('2026-10-16');

    await writeFile(currentFile, JSON.stringify({ manifest: { ...updated, entries: [second], withdrawn: [publicEntry.id], retired: [publicEntry] } }));
    expect(calendarStats((await getWritingActivity()).posts, 2026)).toEqual({ posts: 1, days: 1 });
  });
});
