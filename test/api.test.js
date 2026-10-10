// Tests for the admin API routes. GitHub is replaced by an in-memory fake.
// Run with: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_PASSWORD = 'correct horse battery';
process.env.SESSION_SECRET = 'x'.repeat(48);
process.env.GITHUB_TOKEN = 'server-token';
process.env.GITHUB_OWNER = 'owner';
process.env.GITHUB_REPO = 'repo';

const auth = await import('../api/auth.js');
const content = await import('../api/content.js');
const upload = await import('../api/upload.js');
const seo = await import('../api/seo.js');

const ORIGIN = 'https://portfolio.example';
let files;
let commits;

beforeEach(() => {
  files = { 'data/portfolio.json': { text: JSON.stringify({ profile: { first_name: 'M. Rifki' } }), sha: 'sha-1' } };
  commits = [];
  globalThis.fetch = async (url, opts = {}) => {
    assert.equal(opts.headers.Authorization, 'Bearer server-token');
    const path = decodeURIComponent(new URL(url).pathname.replace('/repos/owner/repo/contents/', ''));
    if ((opts.method || 'GET') === 'GET') {
      const f = files[path];
      if (!f) return Response.json({ message: 'Not Found' }, { status: 404 });
      return Response.json({ sha: f.sha, size: f.text.length, content: Buffer.from(f.text).toString('base64') });
    }
    const body = JSON.parse(opts.body);
    if (files[path] && body.sha !== files[path].sha) return Response.json({ message: 'conflict' }, { status: 409 });
    const sha = `sha-${commits.length + 2}`;
    files[path] = { text: Buffer.from(body.content, 'base64').toString('utf8'), sha };
    commits.push({ path, ...body });
    return Response.json({ content: { sha }, commit: { html_url: 'https://github.com/c/1' } });
  };
});

function req(path, { method = 'GET', body, cookie, origin = ORIGIN } = {}) {
  const headers = { host: 'portfolio.example' };
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function login() {
  const res = await auth.POST(req('/api/auth', { method: 'POST', body: { password: 'correct horse battery' } }));
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

test('login rejects a wrong password and accepts the right one', async () => {
  const bad = await auth.POST(req('/api/auth', { method: 'POST', body: { password: 'nope' } }));
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('set-cookie'), null);

  const res = await auth.POST(req('/api/auth', { method: 'POST', body: { password: 'correct horse battery' } }));
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);

  const status = await auth.GET(req('/api/auth', { cookie: cookie.split(';')[0] }));
  assert.deepEqual(await status.json(), { authenticated: true });
});

test('cross-site and origin-less writes are blocked', async () => {
  const cookie = await login();
  const evil = await content.PUT(req('/api/content', { method: 'PUT', body: { data: { profile: {} } }, cookie, origin: 'https://evil.example' }));
  assert.equal(evil.status, 403);
  const none = await auth.POST(req('/api/auth', { method: 'POST', body: { password: 'correct horse battery' }, origin: null }));
  assert.equal(none.status, 403);
  assert.equal(commits.length, 0);
});

test('content requires a valid, untampered session', async () => {
  assert.equal((await content.GET(req('/api/content'))).status, 401);
  const cookie = await login();
  const [name, value] = cookie.split('=');
  const tampered = `${name}=${value.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))}`;
  assert.equal((await content.GET(req('/api/content', { cookie: tampered }))).status, 401);

  const expiredPayload = Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url');
  assert.equal((await content.GET(req('/api/content', { cookie: `${name}=${expiredPayload}.${value.split('.')[1]}` }))).status, 401);

  const res = await content.GET(req('/api/content', { cookie }));
  assert.deepEqual(await res.json(), { data: { profile: { first_name: 'M. Rifki' } }, sha: 'sha-1' });
});

test('publishing commits the data, stamps meta.updated and detects conflicts', async () => {
  const cookie = await login();
  const data = { profile: { first_name: 'Rifki ✓' }, experience: [] };

  const ok = await content.PUT(req('/api/content', { method: 'PUT', body: { data, baseSha: 'sha-1', message: 'Update' }, cookie }));
  assert.equal(ok.status, 200);
  const saved = JSON.parse(files['data/portfolio.json'].text);
  assert.equal(saved.profile.first_name, 'Rifki ✓');
  assert.match(saved.meta.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(commits[0].branch, 'main');
  assert.equal(commits[0].sha, 'sha-1');

  const stale = await content.PUT(req('/api/content', { method: 'PUT', body: { data, baseSha: 'sha-1' }, cookie }));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).conflict, true);

  const forced = await content.PUT(req('/api/content', { method: 'PUT', body: { data, baseSha: 'sha-1', force: true }, cookie }));
  assert.equal(forced.status, 200);
  assert.equal(commits.length, 2);
});

test('publishing rejects malformed data', async () => {
  const cookie = await login();
  const res = await content.PUT(req('/api/content', { method: 'PUT', body: { data: { profile: {}, projects: 'x' } }, cookie }));
  assert.equal(res.status, 400);
  assert.equal(commits.length, 0);
});

test('upload accepts images only', async () => {
  const cookie = await login();
  const text = await upload.POST(req('/api/upload', { method: 'POST', body: { filename: 'a.jpg', content: Buffer.from('<script>').toString('base64') }, cookie }));
  assert.equal(text.status, 415);

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const res = await upload.POST(req('/api/upload', { method: 'POST', body: { filename: 'My Photo.png', content: jpeg.toString('base64') }, cookie }));
  assert.equal(res.status, 200);
  const { path } = await res.json();
  assert.match(path, /^images\/my-photo-[a-z0-9]+\.jpg$/);
  assert.equal(commits[0].path, path);
});

test('robots.txt and sitemap.xml use the request host', async () => {
  const robots = await (await seo.GET(req('/api/seo?file=robots'))).text();
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap: https:\/\/portfolio\.example\/sitemap\.xml/);
  const sitemap = await (await seo.GET(req('/api/seo?file=sitemap'))).text();
  assert.match(sitemap, /<loc>https:\/\/portfolio\.example\/<\/loc>/);
});
