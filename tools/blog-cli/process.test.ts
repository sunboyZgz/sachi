import { describe, expect, it, vi } from 'vitest';
import { run } from './process';

describe('Execa process adapter', () => {
  it('keeps trailing newlines and passes stdin without using a shell', async () => {
    const result = await run([process.execPath, '-e', 'process.stdin.pipe(process.stdout)'], { cwd: process.cwd(), input: '精确输出\n\n' });
    expect(result.stdout).toBe('精确输出\n\n');
    const literal = '$(printf SHOULD_NOT_EXECUTE); `pwd`';
    expect((await run([process.execPath, '-e', 'process.stdout.write(process.argv[1])', literal], { cwd: process.cwd() })).stdout).toBe(literal);
  });
  it('removes explicitly cleared inherited environment variables', async () => {
    vi.stubEnv('SACHI_PROCESS_TEST', 'inherited');
    try {
      expect((await run([process.execPath, '-e', 'process.stdout.write(process.env.SACHI_PROCESS_TEST ?? "cleared")'], { cwd: process.cwd(), env: { SACHI_PROCESS_TEST: undefined } })).stdout).toBe('cleared');
    } finally { vi.unstubAllEnvs(); }
  });
  it('retains the caller error code and child stderr on failure', async () => {
    await expect(run([process.execPath, '-e', 'process.stderr.write("bad media");process.exit(11)'], { cwd: process.cwd(), code: 3 })).rejects.toMatchObject({ code: 3, status: 'ERROR', message: expect.stringContaining('bad media') });
  });
  it('reports timeout as UNKNOWN rather than claiming success', async () => {
    await expect(run([process.execPath, '-e', 'setTimeout(()=>{},10000)'], { cwd: process.cwd(), code: 7, timeout: 50 })).rejects.toMatchObject({ code: 7, status: 'UNKNOWN' });
  });
  it('sends echoed stdout and stderr to diagnostic stderr, not JSON stdout', async () => {
    const output = vi.spyOn(process.stdout, 'write');
    const diagnostic = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      await run([process.execPath, '-e', 'process.stdout.write("build output");process.stderr.write("build diagnostic")'], { cwd: process.cwd(), echo: true });
      expect(output).not.toHaveBeenCalled();
      expect(diagnostic.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('build output');
      expect(diagnostic.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('build diagnostic');
    } finally { output.mockRestore(); diagnostic.mockRestore(); }
  });
});
