import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entry = path.join(root, 'bin/blog.mjs');

describe('installed blog executable', () => {
  it('registers the TypeScript runtime and shows help without npm output', async () => {
    const { stdout, stderr } = await execute(process.execPath, [entry, '--help'], { cwd: root });
    expect(stdout).toContain('Usage: blog');
    expect(stdout).toContain('publish');
    expect(stderr).toBe('');
  });
  it('returns help rather than blocking on prompts outside a terminal', async () => {
    const { stdout } = await execute(process.execPath, [entry], { cwd: root });
    expect(stdout).toContain('Usage: blog');
  });
  it('uses the shared error handler for machine-readable argument errors', async () => {
    await expect(execute(process.execPath, [entry, 'unknown-command', '--json'], { cwd: root })).rejects.toMatchObject({
      code: 2, stderr: '', stdout: expect.stringContaining('"status":"ERROR"'),
    });
  });
  it('does not launch a wizard in JSON mode', async () => {
    await expect(execute(process.execPath, [entry, 'wizard', '--json'], { cwd: root })).rejects.toMatchObject({
      code: 2, stdout: expect.stringContaining('INPUT_REQUIRED'),
    });
  });
});
