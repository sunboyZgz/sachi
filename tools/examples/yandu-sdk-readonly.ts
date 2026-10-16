import path from 'node:path';
import { Configuration, ResponseError, StorageApi } from '@yandu/storage-server';
import { loadConfig } from '../blog-cli/config';
import { loadUploadCredential } from '../blog-cli/credentials';

// Run from Sachi, or pass its root as the first argument. No uploads or writes.
async function main() {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const config = await loadConfig(root);
  if (!config.yandu) throw new Error('Yandu is not configured');
  const { gateway, projectId } = config.yandu;
  const api = new StorageApi(new Configuration({
    basePath: gateway.replace(/\/$/, ''),
    accessToken: loadUploadCredential(root, config.yandu),
    fetchApi: (url, init) => fetch(url, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(60_000),
    }),
  }));
  const capacity = await api.getCapacity({ projectId });
  let cursor: string | undefined;
  let rootEntries = 0;
  const visited = new Set<string>();
  do {
    const page = await api.listEntries({ projectId, parentId: '', limit: 200, cursor });
    rootEntries += page.items.length;
    cursor = page.nextCursor || undefined;
    if (cursor && visited.has(cursor)) throw new Error('Repeated pagination cursor');
    if (cursor) visited.add(cursor);
  } while (cursor);
  console.log(JSON.stringify({ projectId, capacity, rootEntries }, null, 2));
}

main().catch((error: unknown) => {
  // Never print request headers, credential contents or upstream response bodies.
  console.error(error instanceof ResponseError
    ? `Yandu SDK 返回 HTTP ${error.response.status}；请检查网关、项目与凭证权限。`
    : 'Yandu SDK 检查失败；请检查 JSON 配置、连接与目录分页。');
  process.exitCode = 2;
});
