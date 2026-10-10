import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixturesAreVisible, getAllPosts } from './content';

let root: string;

async function article(directory: string, slug: string, fixture: boolean) {
  await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, directory, `${slug}.md`), `---\ntitle: ${slug}\ndate: 2026-10-08\ncategory: play\nfixture: ${fixture}\n---\n\n正文。\n`);
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sachi-content-isolation-')));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('BLOG_CONTENT_MODE', 'working');
  vi.stubEnv('INCLUDE_FIXTURES', 'false');
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe('working content and explicit fixture isolation', () => {
  it('shows working articles without loading test samples or stray fixture articles', async () => {
    await article('content', 'real-writing', false);
    await article('content', 'stray-mock', true);
    await article('tests/fixtures/content', 'test-sample', true);
    expect(fixturesAreVisible()).toBe(false);
    expect((await getAllPosts()).map((post) => post.slug)).toEqual(['real-writing']);
  });

  it('loads only test content when fixtures are explicitly requested', async () => {
    await article('content', 'private-working-draft', false);
    await article('tests/fixtures/content', 'test-sample', true);
    vi.stubEnv('INCLUDE_FIXTURES', 'true');
    expect((await getAllPosts()).map((post) => post.slug)).toEqual(['test-sample']);
  });

  it('keeps an empty blog empty even when test content exists', async () => {
    await article('tests/fixtures/content', 'test-sample', true);
    expect(await getAllPosts()).toEqual([]);
  });
});
