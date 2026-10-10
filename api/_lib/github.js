// Server-side GitHub Contents API client. The token never leaves the server.
import { HttpError } from './http.js';

const API = 'https://api.github.com';

export function repoConfig() {
  const cfg = {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || '',
    branch: process.env.GITHUB_BRANCH || 'main',
  };
  const missing = ['token', 'owner', 'repo'].filter((k) => !cfg[k]).map((k) => `GITHUB_${k.toUpperCase()}`);
  if (missing.length) throw new HttpError(500, `Server is not configured: missing ${missing.join(', ')}`);
  return cfg;
}

async function gh(cfg, path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${cfg.token}`,
      'User-Agent': 'portfolio-admin',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new HttpError(
      res.status === 404 ? 404 : 502,
      res.status === 401 || res.status === 403
        ? 'GitHub rejected the server token (check GITHUB_TOKEN and its Contents permission)'
        : `GitHub error ${res.status}: ${body.message || 'unknown'}`,
    );
    err.githubStatus = res.status;
    throw err;
  }
  return body;
}

const contentPath = (cfg, path) =>
  `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;

/** Returns { text, sha } or null when the file does not exist. */
export async function getFile(cfg, path) {
  try {
    const file = await gh(cfg, `${contentPath(cfg, path)}?ref=${encodeURIComponent(cfg.branch)}`);
    let content = file.content || '';
    if (!content && file.size > 0) {
      // Files over 1 MB are not inlined; fetch the blob instead.
      const blob = await gh(cfg, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/blobs/${file.sha}`);
      content = blob.content;
    }
    return { text: Buffer.from(content, 'base64').toString('utf8'), sha: file.sha };
  } catch (err) {
    if (err.githubStatus === 404) return null;
    throw err;
  }
}

/** Creates or updates a file. `content` is a Buffer. */
export async function putFile(cfg, path, content, message, sha) {
  const body = { message, content: content.toString('base64'), branch: cfg.branch };
  if (sha) body.sha = sha;
  try {
    const res = await gh(cfg, contentPath(cfg, path), { method: 'PUT', body: JSON.stringify(body) });
    return { sha: res.content.sha, commitUrl: res.commit && res.commit.html_url };
  } catch (err) {
    if (err.githubStatus === 409 || err.githubStatus === 422) {
      throw new HttpError(409, 'The file changed on GitHub while saving. Reload and try again.');
    }
    throw err;
  }
}
