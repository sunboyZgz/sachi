import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { BlogError } from '../../src/lib/blog/files';

type Address = { address: string; family: number };
type Response = { statusCode: number; location?: string };
export type PublicUrlCheck = { url: string; finalUrl: string; statusCode: number; checkedAt: string };
export type UrlRuntime = {
  resolve: (host: string) => Promise<Address[]>;
  get: (url: URL, addresses: Address[], signal: AbortSignal) => Promise<Response>;
};

export function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; }
  catch { return false; }
}

export function parseProjectUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new BlogError('项目地址必须是完整的 HTTP(S) 公网地址。', 3, 'INVALID_PROJECT_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new BlogError('项目地址必须使用 HTTP(S)，且不能包含登录凭证。', 3, 'INVALID_PROJECT_URL');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host.toLowerCase().replace(/\.$/, '') === 'localhost' || host.toLowerCase().replace(/\.$/, '').endsWith('.localhost') || isIP(host) && !publicAddress(host)) throw new BlogError('项目地址不能使用本机、内网或保留地址。', 3, 'INVALID_PROJECT_URL');
  return url;
}

const runtime: UrlRuntime = {
  resolve: (host) => lookup(host, { all: true, verbatim: true }),
  get: (url, addresses, signal) => new Promise((resolve, reject) => {
    // Pin the connection to the already checked DNS results. No proxy, cookie,
    // credential, pooled socket or second DNS lookup can change its destination.
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', agent: false, signal,
      headers: { 'User-Agent': 'blog-cli/1.0', Accept: '*/*' },
      lookup: (_host, options, callback) => {
        const permitted = addresses.filter((entry) => !options.family || entry.family === options.family);
        if (!permitted.length) { callback(new Error('没有可连接的公网地址'), '', 4); return; }
        if (options.all) callback(null, permitted);
        else callback(null, permitted[0].address, permitted[0].family);
      },
    }, (response) => {
      resolve({ statusCode: response.statusCode ?? 0, location: response.headers.location });
      response.destroy();
    });
    request.once('error', reject);
    request.end();
  }),
};

/** Anonymous, bounded GET; redirects are validated before contacting their host. */
export async function checkProjectUrl(value: string, network: UrlRuntime = runtime): Promise<PublicUrlCheck> {
  const original = parseProjectUrl(value);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 20_000);
  const stop = new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new BlogError('项目地址检查超过 20 秒，请稍后重试。', 3, 'PROJECT_URL_UNREACHABLE')), { once: true }));
  const redirects = new Set([301, 302, 303, 307, 308]);
  const visited = new Set<string>();
  try {
    let url = original;
    for (let hop = 0; hop <= 5; hop++) {
      const target = new URL(url); target.hash = '';
      if (visited.has(target.href)) throw new BlogError('项目地址发生循环重定向。', 3, 'PROJECT_URL_UNREACHABLE');
      visited.add(target.href);
      const host = target.hostname.replace(/^\[|\]$/g, '');
      const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([network.resolve(host), stop]);
      if (!addresses.length || addresses.some((entry) => ![4, 6].includes(entry.family) || !publicAddress(entry.address))) throw new BlogError('项目地址的 DNS 结果包含本机、内网或保留地址。', 3, 'INVALID_PROJECT_URL');
      const response = await Promise.race([network.get(target, addresses, abort.signal), stop]);
      if (response.statusCode >= 200 && response.statusCode < 300) return { url: original.href, finalUrl: url.href, statusCode: response.statusCode, checkedAt: new Date().toISOString() };
      if (!redirects.has(response.statusCode) || !response.location) throw new BlogError(`项目地址匿名访问失败：HTTP ${response.statusCode}。`, 3, 'PROJECT_URL_UNREACHABLE');
      if (hop === 5) throw new BlogError('项目地址重定向超过 5 次。', 3, 'PROJECT_URL_UNREACHABLE');
      let next: URL;
      try { next = new URL(response.location, target); }
      catch { throw new BlogError('项目地址返回无效的重定向。', 3, 'INVALID_PROJECT_URL'); }
      url = parseProjectUrl(next.href);
    }
    throw new BlogError('项目地址检查未完成。', 3, 'PROJECT_URL_UNREACHABLE');
  } catch (error) {
    if (error instanceof BlogError) throw error;
    throw new BlogError(`项目地址无法匿名访问：${error instanceof Error ? error.message : String(error)}`, 3, 'PROJECT_URL_UNREACHABLE');
  } finally { clearTimeout(timeout); abort.abort(); }
}
