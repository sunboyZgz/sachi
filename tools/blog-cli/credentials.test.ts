import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configSchema } from '../../src/lib/blog/schema';
import { loadUploadCredential, uploadCredentialPath } from './credentials';

const roots: string[] = [];
async function fixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'sachi-config-')); roots.push(parent);
  const root = path.join(parent, 'project'); await mkdir(path.join(root, '.sachi'), { recursive: true });
  const config = configSchema.parse({ schemaVersion: 1, timezone: 'Asia/Shanghai', yandu: { gateway: 'http://127.0.0.1:18770', projectId: 'blog', credentialEnv: 'YANDU_CONFIG_TEST' } }).yandu!;
  vi.stubEnv('YANDU_CONFIG_TEST', 'environment-fallback');
  return { root, parent, config, file: path.join(root, config.credentialFile) };
}
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('private configuration files before environment fallback', () => {
  it('uses only the file when both sources are available', async () => {
    const f = await fixture();
    await writeFile(f.file, JSON.stringify({ schemaVersion: 1, uploadKey: 'file-key' }), { mode: 0o600 });
    expect(loadUploadCredential(f.root, f.config)).toBe('file-key');
    vi.stubEnv('YANDU_CONFIG_TEST', '');
    expect(loadUploadCredential(f.root, f.config)).toBe('file-key');
  });
  it('uses the environment only when the selected file is absent', async () => {
    const f = await fixture();
    expect(loadUploadCredential(f.root, f.config)).toBe('environment-fallback');
    vi.stubEnv('YANDU_CONFIG_TEST', '');
    expect(() => loadUploadCredential(f.root, f.config)).toThrow('配置文件不存在');
  });
  it('does not repair malformed, incomplete or empty files with environment values', async () => {
    const f = await fixture();
    for (const raw of ['', '{"uploadKey":"do-not-log-this-secret"', '{}', '{"schemaVersion":1,"uploadKey":""}', '{"schemaVersion":1,"uploadKey":"bad\\nkey"}', '{"schemaVersion":1,"uploadKey":"valid-key","typo":true}']) {
      await writeFile(f.file, raw);
      try { loadUploadCredential(f.root, f.config); throw new Error('expected config rejection'); }
      catch (error) {
        expect(error).toMatchObject({ status: 'INVALID_CONFIG' });
        expect((error as Error).message).not.toContain('do-not-log-this-secret');
      }
    }
  });
  it('rejects unreadable file types and dangling links instead of falling back', async () => {
    const f = await fixture();
    await mkdir(f.file);
    expect(() => loadUploadCredential(f.root, f.config)).toThrow('无法读取');
    await rm(f.file, { recursive: true });
    await symlink(path.join(f.parent, 'missing.json'), f.file);
    expect(() => loadUploadCredential(f.root, f.config)).toThrow('无法读取');
  });
  it('supports external private files and rejects code, public and writing-backup locations', async () => {
    const f = await fixture(); const external = path.join(f.parent, 'private.json');
    await writeFile(external, JSON.stringify({ schemaVersion: 1, uploadKey: 'external-file-key' }));
    expect(loadUploadCredential(f.root, { ...f.config, credentialFile: external })).toBe('external-file-key');
    for (const filename of ['src/config/secret.json', 'public/secret.json', '.blog-store/secret.json', 'secret.json', '../project/public/secret.json']) expect(() => uploadCredentialPath(f.root, filename)).toThrow('项目内凭证配置');
  });
});
