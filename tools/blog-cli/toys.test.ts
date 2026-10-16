import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { stringify } from 'yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exists, sha256, stableJson, walk, writeJson } from '../../src/lib/blog/files';

import { legacyConfig as defaultConfig } from '../../tests/helpers/legacy-config';
import { parseCli } from './arguments';
import { confirmation } from './context';
import { executeToys } from './commands/toys';
import { main } from './index';
import { humanResult } from './reporter';
import type { PromptDriver } from './prompts';
import { completeInvocation } from './wizard';
import { checkToy, collectToyInput, inspectToyCover, inspectToyVideo, localToyFile, readToyInput, readToyRecord, saveToy, saveToyTemplate, toyCatalogue, toyDigest, toyInputSchema, type ToyPlan } from './toys';

const temporary: string[] = [];
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hasVideoTools = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const id = 'dab121ae-6c14-4bea-9e88-a2c8a0a8f525';
afterEach(async () => { vi.restoreAllMocks(); for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sachi-toy-test-'))); temporary.push(root);
  await mkdir(path.join(root, 'input/assets'), { recursive: true });
  await sharp({ create: { width: 32, height: 24, channels: 3, background: '#667766' } }).png().toFile(path.join(root, 'input/assets/cover.png'));
  await cp(path.join(source, 'docs-site/public/examples/demo.mp4'), path.join(root, 'input/assets/demo.mp4'));
  await writeJson(path.join(root, 'blog.config.json'), defaultConfig('UTC'));
  const input = toyInputSchema.parse({ title: '竹影时钟', description: '一件真实资料的教学作品。', cover: './assets/cover.png', video: './assets/demo.mp4', projectUrl: 'https://example.com/', videoOverflow: 'reject' });
  const file = path.join(root, 'input/toy.yaml'); await writeFile(file, stringify(input));
  return { root, input, file };
}
async function inspectedPlan(root: string, file: string): Promise<ToyPlan> {
  const { input, origin } = await readToyInput(root, file);
  return { input, origin, cover: { ...await toyDigest(input.cover), ...await inspectToyCover(input.cover) }, video: { ...await toyDigest(input.video), ...await inspectToyVideo(root, input.video) },
    project: { url: input.projectUrl, finalUrl: input.projectUrl, statusCode: 200, checkedAt: new Date().toISOString() } };
}
function prompts(values: string[] = [], selections: string[] = [], confirm = false): PromptDriver {
  return { enabled: true, input: vi.fn(async (_question, validate) => { const value = values.shift()!; expect(await validate(value)).toBe(true); return value; }),
    select: vi.fn(async () => selections.shift()!), checkbox: vi.fn(async () => []), confirm: vi.fn(async () => confirm) };
}

describe('local-only toy CLI', () => {
  it('parses both entry modes, explicit overflow policy and read-only commands without adding publication flags', () => {
    expect(parseCli(['toy', 'add', '--file', 'toy.yaml', '--video-overflow', 'trim-start', '--json', '--yes'])).toMatchObject({ command: 'toy', toyAction: 'add', options: { file: 'toy.yaml', 'video-overflow': 'trim-start', json: true, yes: true } });
    expect(parseCli(['toy', 'check', id])).toMatchObject({ toyAction: 'check', selectors: [id] });
    expect(parseCli(['toy', 'template', '--output', 'toy.yaml', '--dry-run']).options).toMatchObject({ output: 'toy.yaml', 'dry-run': true });
    for (const args of [['toy', 'add', '--video-overflow', 'maybe'], ['toy', 'add', '--order', '1'], ['build', '--toy', id], ['publish', '--toy', id], ['toy', 'list', '--file', 'toy.yaml']]) expect(() => parseCli(args)).toThrow();
  });
  it('generates a real editable template without registering a work or overwriting files', async () => {
    const { root } = await fixture();
    const result = await saveToyTemplate(root, 'templates/toy.yaml');
    expect(await readFile(result.file, 'utf8')).toContain('videoOverflow: reject');
    expect(await exists(path.join(root, 'content/toys'))).toBe(false);
    await expect(readToyInput(root, result.file)).rejects.toMatchObject({ status: 'INVALID_TOY' });
    await expect(saveToyTemplate(root, result.file)).rejects.toMatchObject({ status: 'TOY_EXISTS' });
  });
  it('refuses incomplete, unknown, duplicate, aliased, unordered or unauthorized input', async () => {
    const { root, file, input } = await fixture();
    for (const value of [{ ...input, title: ' ' }, { ...input, description: '' }, { ...input, video: undefined }, { ...input, videoOverflow: undefined }, { ...input, projectUrl: 'http://127.1' }, { ...input, order: 1 }, { ...input, demoOnly: true }]) {
      await writeFile(file, stringify(value)); await expect(readToyInput(root, file)).rejects.toThrow();
    }
    await writeFile(file, `${stringify(input)}title: 重复名称\n`); await expect(readToyInput(root, file)).rejects.toThrow('YAML');
    await writeFile(file, 'title: &name 竹影时钟\ndescription: *name\n'); await expect(readToyInput(root, file)).rejects.toThrow('别名');
    await expect(collectToyInput(root, { yes: true, json: true }, { ...prompts(), enabled: false })).rejects.toMatchObject({ status: 'INPUT_REQUIRED' });
  });
  it('resolves media from the input file directory and rejects linked files and directories', async () => {
    const { root, file } = await fixture();
    const { input } = await readToyInput(root, file, 'trim-start');
    expect(input.cover).toBe(path.join(root, 'input/assets/cover.png')); expect(input.videoOverflow).toBe('trim-start');
    await symlink(input.cover, path.join(root, 'linked.png')); await expect(localToyFile(root, 'linked.png')).rejects.toThrow('符号链接');
    await symlink(path.join(root, 'input'), path.join(root, 'linked')); await expect(localToyFile(root, 'linked/assets/cover.png')).rejects.toThrow('符号链接');
    await expect(saveToyTemplate(root, 'linked/template.yaml')).rejects.toThrow('符号链接');
  });
  it('uses the main menu and gathers the mandatory data and overflow authorization without interpreting --yes as consent', async () => {
    const { root } = await fixture();
    const menu = prompts([], ['toy', 'add']);
    expect(await completeInvocation(root, defaultConfig('UTC'), parseCli([]), menu)).toMatchObject({ command: 'toy', toyAction: 'add' });
    const driver = prompts(['竹影时钟', '一件工具', 'input/assets/cover.png', 'input/assets/demo.mp4', 'https://example.com/', ''], ['trim-start', 'contain']);
    const { input } = await collectToyInput(root, { yes: true }, driver);
    expect(input).toMatchObject({ videoOverflow: 'trim-start', coverFit: 'contain' }); expect(input.videoLabel).toBeUndefined();
    expect(driver.select).toHaveBeenCalledWith(expect.stringContaining('超过 10 MB'), expect.any(Array));
  });
  it('keeps template dry runs and cancelled operations free of directories, IDs or locks', async () => {
    const { root } = await fixture(); const config = defaultConfig('UTC');
    const before = await walk(root); const print = vi.fn(); const driver = prompts();
    await executeToys({ root, config, invocation: parseCli(['toy', 'template', '--output', 'new-dir/toy.yaml', '--dry-run']), prompts: driver, confirm: vi.fn(), print });
    expect(print).toHaveBeenCalledWith('PLANNED', expect.not.objectContaining({ id: expect.anything() }));
    const invocation = parseCli(['toy', 'template', '--output', 'new-dir/toy.yaml']);
    await expect(executeToys({ root, config, invocation, prompts: driver, confirm: confirmation(invocation, driver, () => {}), print })).rejects.toMatchObject({ status: 'CANCELLED' });
    expect(await walk(root)).toEqual(before);
    await expect(main(['toy', 'add', '--root', root, '--yes', '--json'])).rejects.toMatchObject({ status: 'INPUT_REQUIRED' });
  });
  it.skipIf(!hasVideoTools)('decodes real media and saves only pending metadata with exact source hashes and unknown processed values', async () => {
    const { root, file } = await fixture(); const plan = await inspectedPlan(root, file);
    const original = await readFile(plan.input.video); const result = await saveToy(root, plan);
    const record = await readToyRecord(root, result.id);
    expect(record.validation.video).toMatchObject({ hash: sha256(original), bytes: original.length }); expect(record.validation.video.durationSeconds).toBeGreaterThan(0);
    expect(record.processing).toEqual({ maxOutputBytes: 10_000_000, outputBytes: null, retainedSeconds: null }); expect(record.state).toBe('pending-media');
    expect(await readFile(plan.input.video)).toEqual(original);
    expect(await walk(path.join(root, 'content'))).toEqual([`toys/${result.id}/toy.yaml`]);
    expect(humanResult('toy', 'PREPARED', result)).toContain('压缩后大小：未知');
    expect((await toyCatalogue(root)).toys).toHaveLength(1);
    expect(await exists(path.join(root, '.blog-store'))).toBe(false); expect(await exists(path.join(root, 'src/config/gallery.ts'))).toBe(false);
  });
  it.skipIf(!hasVideoTools)('preserves duplicate identities and refuses media or YAML changed after review', async () => {
    const { root, file } = await fixture(); const plan = await inspectedPlan(root, file); plan.input.id = id;
    const result = await saveToy(root, plan); const registered = await readFile(path.join(root, result.file));
    await expect(saveToy(root, plan)).rejects.toMatchObject({ status: 'TOY_EXISTS' }); expect(await readFile(path.join(root, result.file))).toEqual(registered);
    delete plan.input.id; await writeFile(plan.input.cover, await sharp({ create: { width: 30, height: 20, channels: 3, background: '#335533' } }).png().toBuffer());
    await expect(saveToy(root, plan)).rejects.toMatchObject({ status: 'SOURCE_CHANGED' });
    const changed = await inspectedPlan(root, file); await writeFile(file, `${await readFile(file, 'utf8')}# another edit\n`);
    await expect(saveToy(root, changed)).rejects.toMatchObject({ status: 'SOURCE_CHANGED' });
    expect((await toyCatalogue(root)).toys).toHaveLength(1);
  });
  it.skipIf(!hasVideoTools)('checks actual source changes without updating the registered record or any source file', async () => {
    const { root, file } = await fixture(); const plan = await inspectedPlan(root, file); const added = await saveToy(root, plan);
    const recordFile = path.join(root, added.file); const before = await readFile(recordFile);
    await sharp({ create: { width: 20, height: 24, channels: 3, background: '#335566' } }).png().toFile(plan.input.cover);
    const files = await walk(root);
    await expect(checkToy(root, added.id)).rejects.toMatchObject({ status: 'SOURCE_CHANGED', details: { state: 'pending-media', changed: [{ field: 'cover' }] } });
    expect(await readFile(recordFile)).toEqual(before); expect(await walk(root)).toEqual(files);
    expect(await readFile(plan.input.video)).toEqual(await readFile(path.join(source, 'docs-site/public/examples/demo.mp4')));
  });
  it.skipIf(!hasVideoTools)('refuses misleading extensions and corrupt media instead of treating file existence as sufficient', async () => {
    const { root } = await fixture(); const file = path.join(root, 'broken.mp4'); await writeFile(file, 'not a video');
    await expect(inspectToyVideo(root, file)).rejects.toThrow();
    const cover = path.join(root, 'broken.png'); await writeFile(cover, 'not an image'); await expect(inspectToyCover(cover)).rejects.toThrow();
    expect((await lstat(file)).size).toBe(11);
  });
  it('lists incomplete records as problems without writing or pretending they are accepted', async () => {
    const { root } = await fixture(); await mkdir(path.join(root, 'content/toys', id), { recursive: true }); await writeFile(path.join(root, 'content/toys', id, 'toy.yaml'), 'title: unfinished\n');
    const before = stableJson(await walk(root)); const result = await toyCatalogue(root);
    expect(result.toys).toEqual([]); expect(result.issues).toHaveLength(1); expect(stableJson(await walk(root))).toBe(before);
  });
});
