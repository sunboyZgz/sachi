import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, symlink, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createResourceServer, configuration, configurationFileArgument } from './server.mjs';

const sha = (body) => createHash('sha256').update(body).digest('hex');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }

test('public proxy authorizes only frozen resources and streams the Yandu 0.2.0 wire contract', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'sachi-resource-proxy-'));
  const key = 'local-integration-secret-never-public';
  const ownerId = 'article-public';
  const body = Buffer.from('A published media version.');
  const largeChunk = Buffer.alloc(256 * 1024, 7);
  const largeChunks = 64;
  const largeHash = createHash('sha256');
  for (let i = 0; i < largeChunks; i++) largeHash.update(largeChunk);
  const ref = { projectId: 'blog', objectId: 'media', versionId: 'version-1', sha256: sha(body), mime: 'video/mp4', bytes: body.length, ownerId };
  const oldRef = { ...ref, objectId: 'previous-media', versionId: 'version-old' };
  const large = { ...ref, objectId: 'large', bytes: largeChunk.length * largeChunks, sha256: largeHash.digest('hex') };
  const draft = { ...ref, objectId: 'private-draft', ownerId: 'draft-owner' };
  const urlFor = (resource) => `/resources/${resource.sha256}/${resource.objectId}/${resource.versionId}`;
  for (const resource of [ref, oldRef, large, draft]) resource.path = urlFor(resource);
  let mode = 'normal';
  let requests = 0;
  let firstLargeRequestEnded = false;
  const upstream = http.createServer(async (req, res) => {
    requests++;
    const request = new URL(req.url, 'http://localhost');
    assert.equal(req.headers.authorization, `Bearer ${key}`);
    assert.ok(req.headers['accept-encoding'].split(',').every((value) => value.trim() === 'identity'));
    assert.equal(request.searchParams.has('key'), false);
    if (mode === 'credential') { res.writeHead(401); res.end(`private error ${key}`); return; }
    if (mode === 'tunnel') { res.writeHead(503); res.end(`private tunnel endpoint ${key}`); return; }
    if (mode === 'redirect') { res.writeHead(302, { Location: 'http://example.invalid/private' }); res.end(); return; }
    if (mode === 'hang') return;
    const resource = [ref, oldRef, large].find((entry) => request.pathname === `/storage/v1/projects/blog/objects/${entry.objectId}/content` && request.searchParams.get('versionId') === entry.versionId);
    if (!resource) { res.writeHead(404); res.end('private unknown object'); return; }
    res.setHeader('ETag', mode === 'wrong-version' ? '"incorrect-version"' : `"${resource.sha256}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', resource.mime);
    res.setHeader('Set-Cookie', 'private-cookie=secret');
    if (req.headers['if-match'] && req.headers['if-match'] !== `"${resource.sha256}"`) { res.writeHead(412); res.end(); return; }
    if (req.headers['if-none-match'] === `"${resource.sha256}"`) { res.writeHead(304); res.end(); return; }
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Length': resource.bytes }); res.end(); return; }
    if (mode === 'midstream') {
      res.writeHead(200, { 'Content-Length': resource.bytes }); res.write(body.subarray(0, 4));
      setTimeout(() => res.destroy(), 15); return;
    }
    let range = req.headers.range;
    if (req.headers['if-range'] && req.headers['if-range'] !== `"${resource.sha256}"`) range = undefined;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = Number(match?.[1] || 0);
      const end = Math.min(Number(match?.[2] || resource.bytes - 1), resource.bytes - 1);
      if (start >= resource.bytes) { res.writeHead(416, { 'Content-Range': `bytes */${resource.bytes}` }); res.end('upstream range error'); return; }
      const partial = body.subarray(start, end + 1);
      res.writeHead(206, { 'Content-Length': partial.length, 'Content-Range': `bytes ${start}-${end}/${resource.bytes}` }); res.end(partial); return;
    }
    res.writeHead(200, { 'Content-Length': resource.bytes });
    if (resource !== large) { res.end(body); return; }
    for (let i = 0; i < largeChunks && !res.destroyed; i++) {
      if (!res.write(largeChunk)) await new Promise((resolve) => {
        const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
        res.once('drain', done); res.once('close', done);
      });
      await pause(2);
    }
    firstLargeRequestEnded = true;
    res.end();
  });
  const upstreamUrl = await listen(upstream);
  const warnings = [];
  const config = { root, projectId: 'blog', key, gateway: new URL(upstreamUrl) };
  const proxy = createResourceServer(config, { headerTimeoutMs: 100, idleTimeoutMs: 1000, logger: { warn: (message) => warnings.push(message) } });
  const base = await listen(proxy);
  const release = 'r-proxy-test-0001';
  const inactiveRelease = 'r-proxy-draft-0002';
  const allowlistFile = path.join(root, 'releases', release, 'resource-allowlist.json');
  const allowlist = { schemaVersion: 1, releaseId: release, activeOwnerIds: [ownerId, 'profile'], resources: [ref, oldRef, large] };
  const save = () => writeFile(allowlistFile, JSON.stringify(allowlist));
  await mkdir(path.join(root, 'releases', release, 'site'), { recursive: true });
  await mkdir(path.join(root, 'releases', inactiveRelease, 'site'), { recursive: true });
  await writeFile(path.join(root, 'releases', inactiveRelease, 'resource-allowlist.json'), JSON.stringify({ ...allowlist, releaseId: inactiveRelease, activeOwnerIds: ['draft-owner'], resources: [draft] }));
  await save(); await symlink(`releases/${release}/site`, path.join(root, 'current'));
  t.after(async () => { await close(proxy); await close(upstream); await rm(root, { recursive: true, force: true }); });

  await t.test('GET and historical independent objects use the pinned version with no private headers', async () => {
    const response = await fetch(base + ref.path, { headers: { Authorization: 'Bearer visitor-supplied' } });
    assert.equal(response.status, 200); assert.equal(await response.text(), body.toString());
    assert.equal(response.headers.get('etag'), `"${ref.sha256}"`);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await fetch(base + oldRef.path)).status, 200);
  });
  await t.test('HEAD, video seek, If-Range, If-Match, 304 and 416 preserve HTTP behavior', async () => {
    const head = await fetch(base + ref.path, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(body.length)); assert.equal(await head.text(), '');
    const partial = await fetch(base + ref.path, { headers: { Range: 'bytes=2-8' } });
    assert.equal(partial.status, 206); assert.equal(partial.headers.get('content-range'), `bytes 2-8/${body.length}`); assert.equal(await partial.text(), body.subarray(2, 9).toString());
    assert.equal((await fetch(base + ref.path, { headers: { Range: 'bytes=2-8', 'If-Range': '"old"' } })).status, 200);
    const cached = await fetch(base + ref.path, { headers: { 'If-None-Match': `"${ref.sha256}"` } });
    assert.equal(cached.status, 304); assert.equal(await cached.text(), '');
    assert.equal((await fetch(base + ref.path, { headers: { 'If-Match': '"old"' } })).status, 412);
    const outOfRange = await fetch(base + ref.path, { headers: { Range: 'bytes=999-' } });
    assert.equal(outOfRange.status, 416); assert.equal(outOfRange.headers.get('content-range'), `bytes */${body.length}`); assert.equal(await outOfRange.text(), '');
    assert.equal((await fetch(base + ref.path, { headers: { Range: 'bytes=0-1,4-5' } })).status, 416);
  });
  await t.test('16 MiB reads arrive before upload completes and do not collect the body', async () => {
    const response = await fetch(base + large.path);
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.equal(first.done, false); assert.equal(firstLargeRequestEnded, false);
    let bytes = first.value.length; const actualHash = createHash('sha256').update(first.value);
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; actualHash.update(part.value); }
    assert.equal(bytes, large.bytes); assert.equal(actualHash.digest('hex'), large.sha256);
  });
  await t.test('drafts, private files, directories, other projects, queries and unactivated releases never reach upstream', async () => {
    const before = requests;
    for (const denied of ['/resources/', '/storage/v1/projects/blog/entries', draft.path, ref.path + '?key=secret', ref.path + '/nested', ref.path.replace(ref.objectId, 'unknown')]) {
      assert.equal((await fetch(base + denied)).status, 404);
    }
    assert.equal((await fetch(base + ref.path, { method: 'POST', body: 'attempt' })).status, 405);
    assert.equal(requests, before);
    allowlist.resources.push({ ...ref, projectId: 'other', objectId: 'other-project', path: urlFor({ ...ref, objectId: 'other-project' }) });
    await save(); assert.equal((await fetch(base + allowlist.resources.at(-1).path)).status, 503);
    allowlist.resources.pop(); await save();
  });
  await t.test('withdrawal denies retained versions before evaluating conditional requests; rollback restores authorization', async () => {
    allowlist.activeOwnerIds = ['profile']; await save(); const before = requests;
    assert.equal((await fetch(base + oldRef.path, { headers: { 'If-None-Match': `"${ref.sha256}"` } })).status, 404);
    assert.equal(requests, before);
    const withdrawn = 'r-proxy-withdraw-0003';
    await mkdir(path.join(root, 'releases', withdrawn, 'site'), { recursive: true });
    await writeFile(path.join(root, 'releases', withdrawn, 'resource-allowlist.json'), JSON.stringify({ ...allowlist, releaseId: withdrawn }));
    await unlink(path.join(root, 'current')); await symlink(`releases/${withdrawn}/site`, path.join(root, 'current'));
    assert.equal((await fetch(base + ref.path)).status, 404);
    allowlist.activeOwnerIds = [ownerId, 'profile']; await save();
    await unlink(path.join(root, 'current')); await symlink(`releases/${release}/site`, path.join(root, 'current'));
    assert.equal((await fetch(base + ref.path)).status, 200);
  });
  await t.test('credential, tunnel, redirect, timeout and pinned-version failures expose no secrets', async () => {
    for (const [failure, status] of [['credential', 503], ['tunnel', 503], ['redirect', 502], ['hang', 503], ['wrong-version', 502]]) {
      mode = failure;
      const response = await fetch(base + ref.path); assert.equal(response.status, status);
      const text = await response.text(); assert.equal(text.includes(key), false); assert.equal(text.includes('private'), false);
    }
    mode = 'midstream';
    const broken = await fetch(base + ref.path); assert.equal(broken.status, 200);
    await assert.rejects(() => broken.arrayBuffer());
    mode = 'normal';
    await close(upstream);
    const offline = await fetch(base + ref.path); assert.equal(offline.status, 503); assert.equal((await offline.text()).includes(key), false);
    assert.ok(warnings.every((message) => message === 'Sachi resource request failed'));
  });
  await t.test('malformed private allowlists fail closed without exposing source paths', async () => {
    await writeFile(allowlistFile, '{broken');
    const malformed = await fetch(base + ref.path); assert.equal(malformed.status, 503);
    assert.equal((await malformed.text()).includes(root), false);
    await save();
    await unlink(path.join(root, 'current')); await symlink('releases/../../outside/site', path.join(root, 'current'));
    assert.equal((await fetch(base + ref.path)).status, 503);
  });
});

test('configuration keeps credentials outside URLs and requires a dedicated absolute root', () => {
  const required = { SACHI_DEPLOY_ROOT: '/srv/sachi-blog', YANDU_PROJECT_ID: 'blog', YANDU_READ_KEY: 'secret' };
  assert.equal(configuration(required).gateway.href, 'http://127.0.0.1:19091/');
  assert.equal(configuration(required).port, 19092);
  for (const invalid of [
    { SACHI_DEPLOY_ROOT: '.' }, { YANDU_GATEWAY: 'http://user:secret@localhost/' },
    { YANDU_GATEWAY: 'http://localhost/storage/v1' }, { YANDU_GATEWAY: 'http://localhost/?key=secret' },
    { YANDU_PROJECT_ID: '../other' }, { YANDU_READ_KEY: '' }, { SACHI_RESOURCE_PORT: '0' },
  ]) assert.throws(() => configuration({ ...required, ...invalid }));
});


test('JSON configuration is authoritative and only an absent file permits environment fallback', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sachi-proxy-config-'));
  const configFile = path.join(directory, 'proxy.json');
  const env = { SACHI_DEPLOY_ROOT: '/srv/environment-blog', YANDU_PROJECT_ID: 'environment-blog', YANDU_READ_KEY: 'environment-key', YANDU_GATEWAY: 'http://127.0.0.1:11111', SACHI_RESOURCE_PORT: '11112' };
  const file = { schemaVersion: 1, deployRoot: '/srv/file-blog', projectId: 'file-blog', readKey: 'file-key', gateway: 'http://127.0.0.1:22221', port: 22222 };
  try {
    assert.equal(configuration(env, { configFile }).key, 'environment-key');
    await writeFile(configFile, JSON.stringify(file), { mode: 0o600 });
    const resolved = configuration(env, { configFile });
    assert.equal(resolved.root, file.deployRoot);
    assert.equal(resolved.projectId, file.projectId);
    assert.equal(resolved.key, file.readKey);
    assert.equal(resolved.gateway.href, file.gateway + '/');
    assert.equal(resolved.port, file.port);
    assert.equal(configuration({}, { configFile }).key, 'file-key');
    // Missing optional settings use documented constants, never environment values.
    await writeFile(configFile, JSON.stringify({ schemaVersion: 1, deployRoot: file.deployRoot, projectId: file.projectId, readKey: file.readKey }));
    assert.equal(configuration(env, { configFile }).gateway.href, 'http://127.0.0.1:19091/');
    assert.equal(configuration(env, { configFile }).port, 19092);
    for (const invalid of ['', '{"readKey":"must-not-log"', '{}', JSON.stringify({ ...file, readKey: '' }), JSON.stringify({ ...file, readKey: undefined }), JSON.stringify({ ...file, port: '22222' }), JSON.stringify({ ...file, typo: true })]) {
      await writeFile(configFile, invalid);
      assert.throws(() => configuration(env, { configFile }), (error) => !error.message.includes('must-not-log'));
    }
    await rm(configFile);
    await mkdir(configFile);
    assert.throws(() => configuration(env, { configFile }), /Cannot read/);
    await rm(configFile, { recursive: true });
    await symlink(path.join(directory, 'missing.json'), configFile);
    assert.throws(() => configuration(env, { configFile }), /Cannot read/);
    assert.equal(configurationFileArgument(['--config', configFile]), configFile);
    assert.equal(configurationFileArgument([]), undefined);
    assert.throws(() => configurationFileArgument(['--config']));
    assert.throws(() => configurationFileArgument(['--port', '19092']));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
