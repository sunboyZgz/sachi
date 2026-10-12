import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { checkProjectUrl, parseProjectUrl, publicAddress, type UrlRuntime } from './public-url';

const servers: Server[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve())); });

// Exercise redirects over a real local HTTP fixture, while DNS classification
// and redirect admission still use the production guard. No storage service.
async function network() {
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://fixture.invalid');
    if (url.pathname === '/redirect') { response.writeHead(302, { Location: '/ok' }); response.end(); }
    else if (url.pathname === '/internal') { response.writeHead(302, { Location: 'http://127.0.0.1/secret' }); response.end(); }
    else if (url.pathname === '/internal-dns') { response.writeHead(302, { Location: 'https://private.example/secret' }); response.end(); }
    else if (url.pathname === '/login') { response.writeHead(401); response.end(); }
    else if (url.pathname === '/loop') { response.writeHead(302, { Location: '/loop' }); response.end(); }
    else if (url.pathname.startsWith('/hop/')) { response.writeHead(302, { Location: `/hop/${Number(url.pathname.slice(5)) + 1}` }); response.end(); }
    else response.end('Anonymous public fixture');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); servers.push(server);
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing fixture address');
  const requested: Array<{ url: string; addresses: string[] }> = [];
  const runtime: UrlRuntime = {
    resolve: async (host) => host === 'private.example' ? [{ address: '10.0.0.2', family: 4 }] : [{ address: '8.8.8.8', family: 4 }],
    get: async (url, addresses, signal) => {
      requested.push({ url: url.href, addresses: addresses.map((entry) => entry.address) });
      const response = await fetch(`http://127.0.0.1:${address.port}${url.pathname}`, { redirect: 'manual', signal });
      await response.text();
      return { statusCode: response.status, location: response.headers.get('location') ?? undefined };
    },
  };
  return { runtime, requested };
}

describe('anonymous public project URL guard', () => {
  it('rejects local, special, documentation and mapped private addresses in both families', () => {
    for (const address of ['127.0.0.1', '0.0.0.0', '10.0.0.1', '172.16.1.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '192.0.2.1', '198.18.0.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '::1', '::', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:127.0.0.1']) expect(publicAddress(address), address).toBe(false);
    for (const address of ['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888']) expect(publicAddress(address), address).toBe(true);
    expect(publicAddress('bad-address')).toBe(false);
  });
  it('rejects unsafe schemes, credentials and alternative encodings of loopback before any request', () => {
    for (const url of ['javascript:alert(1)', 'file:///tmp/project', '//example.com', 'https://user:secret@example.com', 'http://localhost', 'http://a.localhost.', 'http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://[::ffff:127.0.0.1]']) expect(() => parseProjectUrl(url), url).toThrow();
  });
  it('uses all DNS results and refuses a mixed public/private result before GET', async () => {
    const { runtime, requested } = await network();
    runtime.resolve = async () => [{ address: '8.8.8.8', family: 4 }, { address: '192.168.1.1', family: 4 }];
    await expect(checkProjectUrl('https://public.example/', runtime)).rejects.toMatchObject({ status: 'INVALID_PROJECT_URL' });
    expect(requested).toEqual([]);
  });
  it('follows public redirects, preserves URL fragments in the receipt and checks the destination before GET', async () => {
    const { runtime, requested } = await network();
    expect(await checkProjectUrl('https://public.example/redirect#section', runtime)).toMatchObject({ url: 'https://public.example/redirect#section', finalUrl: 'https://public.example/ok', statusCode: 200 });
    expect(requested).toEqual([{ url: 'https://public.example/redirect', addresses: ['8.8.8.8'] }, { url: 'https://public.example/ok', addresses: ['8.8.8.8'] }]);
    for (const route of ['internal', 'internal-dns']) {
      requested.length = 0;
      await expect(checkProjectUrl(`https://public.example/${route}`, runtime)).rejects.toMatchObject({ status: 'INVALID_PROJECT_URL' });
      expect(requested).toHaveLength(1);
    }
  });
  it('does not accept login errors, redirect loops or more than five redirects', async () => {
    const { runtime, requested } = await network();
    await expect(checkProjectUrl('https://public.example/login', runtime)).rejects.toThrow('401');
    await expect(checkProjectUrl('https://public.example/loop', runtime)).rejects.toThrow('循环');
    requested.length = 0;
    await expect(checkProjectUrl('https://public.example/hop/0', runtime)).rejects.toThrow('超过 5 次');
    expect(requested).toHaveLength(6);
  });
});
