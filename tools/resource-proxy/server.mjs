import http from 'node:http';
import { lstatSync, readFileSync } from 'node:fs';
import { readFile, readlink, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';

// Wire contract: @yandu/storage-server 0.2.0, downloadObject[Head]Raw.
// This file has no package or adjacent source dependency on the production host.
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const releasePattern = /^releases\/(r-[a-zA-Z0-9-]{8,80})\/site$/;
const MAX_ALLOWLIST_BYTES = 16 * 1024 * 1024;
const requestHeaders = ['range', 'if-range', 'if-match', 'if-none-match'];
const acceptedStatuses = new Set([200, 206, 304, 412, 416]);

function unavailable(status = 503) {
  return Object.assign(new Error('Resource temporarily unavailable'), { status });
}

export function configuration(env = process.env, { configFile = '/etc/sachi/resource-proxy.json' } = {}) {
  let settings;
  let raw;
  try {
    const info = lstatSync(configFile);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) throw new Error('invalid file');
    raw = readFileSync(configFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error('Cannot read resource proxy configuration file; environment fallback is disabled');
    settings = { deployRoot: env.SACHI_DEPLOY_ROOT, gateway: env.YANDU_GATEWAY, projectId: env.YANDU_PROJECT_ID, readKey: env.YANDU_READ_KEY, port: env.SACHI_RESOURCE_PORT };
  }
  if (raw !== undefined) {
    try { settings = JSON.parse(raw); } catch { throw new Error('Invalid resource proxy JSON configuration; environment fallback is disabled'); }
    const fields = new Set(['schemaVersion', 'deployRoot', 'gateway', 'projectId', 'readKey', 'port']);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || settings.schemaVersion !== 1 || Object.keys(settings).some((key) => !fields.has(key))) throw new Error('Invalid resource proxy configuration fields; environment fallback is disabled');
  }
  const root = settings.deployRoot;
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) === path.parse(root).root) throw new Error('deployRoot must be an absolute dedicated deployment directory');
  if (settings.gateway !== undefined && typeof settings.gateway !== 'string') throw new Error('gateway must be a URL string');
  const gateway = new URL(settings.gateway ?? 'http://127.0.0.1:19091');
  if (!['http:', 'https:'].includes(gateway.protocol) || gateway.username || gateway.password || gateway.search || gateway.hash || gateway.pathname !== '/') {
    throw new Error('gateway must be a gateway root URL without credentials, query, or fragment');
  }
  if (typeof settings.projectId !== 'string' || !idPattern.test(settings.projectId)) throw new Error('projectId is required');
  if (typeof settings.readKey !== 'string' || !settings.readKey || /[\s\x00-\x1f\x7f]/.test(settings.readKey)) throw new Error('readKey is required');
  if (raw !== undefined && settings.port !== undefined && typeof settings.port !== 'number') throw new Error('port must be a JSON number');
  const port = Number(settings.port ?? 19092);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be a valid port');
  return { root: path.resolve(root), gateway, projectId: settings.projectId, key: settings.readKey, port };
}

export function configurationFileArgument(argv) {
  if (!argv.length) return undefined;
  if (argv.length !== 2 || argv[0] !== '--config' || !argv[1]) throw new Error('Use --config <private JSON file>');
  return path.resolve(argv[1]);
}

function resourcePath(ref) {
  return `/resources/${ref.sha256}/${encodeURIComponent(ref.objectId)}/${encodeURIComponent(ref.versionId)}`;
}

function validResource(ref, projectId) {
  return ref && ref.projectId === projectId && idPattern.test(ref.objectId) && idPattern.test(ref.versionId)
    && /^[a-f0-9]{64}$/.test(ref.sha256) && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(ref.mime)
    && Number.isSafeInteger(ref.bytes) && ref.bytes >= 0 && typeof ref.ownerId === 'string'
    && ref.path === resourcePath(ref);
}

async function authorize(root, projectId, requestPath) {
  // Re-read the active symlink and private allowlist for EVERY request. Never scan
  // releases/: a prepared but unpublished release also exists in that directory.
  const target = await readlink(path.join(root, 'current'));
  const match = releasePattern.exec(target);
  if (!match) throw unavailable();
  const releaseDirectory = path.join(root, 'releases', match[1]);
  const [actualRoot, actualSite, expectedSite] = await Promise.all([
    realpath(root), realpath(path.join(root, 'current')), realpath(path.join(releaseDirectory, 'site')),
  ]);
  if (actualSite !== expectedSite || expectedSite !== path.join(actualRoot, 'releases', match[1], 'site')) throw unavailable();
  const filename = path.join(releaseDirectory, 'resource-allowlist.json');
  const info = await stat(filename);
  if (!info.isFile() || info.size > MAX_ALLOWLIST_BYTES) throw unavailable();
  const allowlist = JSON.parse(await readFile(filename, 'utf8'));
  if (allowlist.schemaVersion !== 1 || allowlist.releaseId !== match[1]
    || !Array.isArray(allowlist.activeOwnerIds) || !allowlist.activeOwnerIds.every((id) => typeof id === 'string')
    || !Array.isArray(allowlist.resources)) throw unavailable();
  const owners = new Set(allowlist.activeOwnerIds);
  const entries = allowlist.resources.filter((ref) => ref?.path === requestPath);
  for (const ref of entries) {
    if (!validResource(ref, projectId)) throw unavailable();
    if (owners.has(ref.ownerId)) return ref;
  }
  return null;
}

function fail(res, status) {
  if (res.headersSent) { res.destroy(); return; }
  const body = status === 404 ? 'Resource not found\n' : status === 405 ? 'Method not allowed\n'
    : status === 416 ? 'Requested range not satisfiable\n' : 'Resource temporarily unavailable\n';
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...(status === 405 ? { Allow: 'GET, HEAD' } : {}),
    ...(status === 503 ? { 'Retry-After': '5' } : {}),
  });
  res.end(body);
}

function expectedResponseBytes(upstream, ref, method) {
  if (upstream.headers.get('etag') !== `"${ref.sha256}"`) throw unavailable(502);
  if (upstream.headers.get('content-encoding') && upstream.headers.get('content-encoding') !== 'identity') throw unavailable(502);
  const length = upstream.headers.get('content-length');
  if (upstream.status === 200) {
    if (length !== String(ref.bytes)) throw unavailable(502);
    return method === 'HEAD' ? 0 : ref.bytes;
  }
  if (upstream.status === 206) {
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(upstream.headers.get('content-range') || '');
    if (!match || Number(match[3]) !== ref.bytes || Number(match[2]) >= ref.bytes || Number(match[1]) > Number(match[2])) throw unavailable(502);
    const bytes = Number(match[2]) - Number(match[1]) + 1;
    if (length !== String(bytes)) throw unavailable(502);
    return method === 'HEAD' ? 0 : bytes;
  }
  if (upstream.status === 416 && upstream.headers.get('content-range') !== `bytes */${ref.bytes}`) throw unavailable(502);
  return 0;
}

export function createResourceServer(config, { headerTimeoutMs = 20_000, idleTimeoutMs = 60_000, logger = console } = {}) {
  const server = http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { fail(res, 405); return; }
    // Match the literal canonical path; queries, percent aliases and nested paths
    // are not alternative routes to an object. No path becomes an upstream URL.
    if (!/^\/resources\/[a-f0-9]{64}\/[a-zA-Z0-9_.-]{1,128}\/[a-zA-Z0-9_.-]{1,128}$/.test(req.url || '')) { fail(res, 404); return; }
    const controller = new AbortController();
    let timeout;
    let upstream;
    let completed = false;
    const armTimeout = (ms) => { clearTimeout(timeout); timeout = setTimeout(() => controller.abort(), ms); timeout.unref(); };
    const clientClosed = () => { if (!completed) controller.abort(); };
    res.once('close', clientClosed);
    try {
      const ref = await authorize(config.root, config.projectId, req.url);
      if (!ref) { fail(res, 404); return; }
      if (req.headers.range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(req.headers.range)) { fail(res, 416); return; }
      const headers = { Authorization: `Bearer ${config.key}`, 'Accept-Encoding': 'identity' };
      for (const name of requestHeaders) {
        if (req.headers[name]) {
          if (typeof req.headers[name] !== 'string' || req.headers[name].length > 4096) { fail(res, 404); return; }
          headers[name] = req.headers[name];
        }
      }
      const endpoint = new URL(`/storage/v1/projects/${encodeURIComponent(config.projectId)}/objects/${encodeURIComponent(ref.objectId)}/content`, config.gateway);
      endpoint.searchParams.set('versionId', ref.versionId);
      armTimeout(headerTimeoutMs);
      upstream = await fetch(endpoint, { method: req.method, headers, redirect: 'manual', signal: controller.signal });
      if (!acceptedStatuses.has(upstream.status)) throw unavailable([401, 403, 408, 429, 502, 503, 504].includes(upstream.status) ? 503 : 502);
      const expectedBytes = expectedResponseBytes(upstream, ref, req.method);
      const safeInline = /^(?:video|audio)\//.test(ref.mime) || /^image\/(?:png|jpeg|gif|webp|avif|apng|x-icon)$/.test(ref.mime);
      const outgoing = {
        'Content-Type': ref.mime, ETag: `"${ref.sha256}"`, 'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': `${safeInline ? 'inline' : 'attachment'}; filename="${ref.sha256}"`,
      };
      for (const name of ['content-length', 'content-range']) {
        if (([200, 206].includes(upstream.status) || (upstream.status === 416 && name === 'content-range')) && upstream.headers.has(name)) outgoing[name] = upstream.headers.get(name);
      }
      res.writeHead(upstream.status, outgoing);
      if (req.method === 'HEAD' || ![200, 206].includes(upstream.status)) {
        await upstream.body?.cancel(); completed = true; res.end(); return;
      }
      if (!upstream.body) throw unavailable(502);
      let received = 0;
      const digest = upstream.status === 200 ? createHash('sha256') : null;
      armTimeout(idleTimeoutMs);
      const verify = new Transform({
        transform(chunk, _encoding, callback) {
          armTimeout(idleTimeoutMs); received += chunk.length; digest?.update(chunk);
          callback(received > expectedBytes ? unavailable(502) : null, chunk);
        },
        flush(callback) {
          callback(received !== expectedBytes || (digest && digest.digest('hex') !== ref.sha256) ? unavailable(502) : null);
        },
      });
      await pipeline(Readable.fromWeb(upstream.body), verify, res, { signal: controller.signal });
      completed = true;
    } catch (error) {
      // Never log upstream bodies, URLs, request headers or caught error text:
      // those can contain project credentials or private storage details.
      if (!res.destroyed) fail(res, error?.status || 503);
      logger.warn?.('Sachi resource request failed');
    } finally {
      clearTimeout(timeout); res.off('close', clientClosed);
      if (!completed) { controller.abort(); await upstream?.body?.cancel().catch(() => {}); }
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const config = configuration(process.env, { configFile: configurationFileArgument(process.argv.slice(2)) });
    const server = createResourceServer(config);
    server.on('error', () => { console.error('Sachi resource proxy could not listen'); process.exitCode = 1; });
    server.listen(config.port, '127.0.0.1', () => console.log(`Sachi resource proxy listening on 127.0.0.1:${config.port}`));
    const stop = () => { server.close(); server.closeIdleConnections(); setTimeout(() => process.exit(0), 10_000).unref(); };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
  } catch { console.error('Sachi resource proxy configuration is invalid; check the private JSON configuration (environment is used only when the file does not exist)'); process.exitCode = 1; }
}
