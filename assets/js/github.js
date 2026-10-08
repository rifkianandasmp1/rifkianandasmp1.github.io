/* ============================================================
   Minimal GitHub Contents API client used by the admin panel.
   Reads and commits files in the portfolio repository, so the
   GitHub repo itself acts as the backend/database.
   ============================================================ */
(function (global) {
  'use strict';

  const API = 'https://api.github.com';

  // UTF-8 safe base64 helpers (btoa/atob only handle Latin-1).
  function bytesToBase64(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }
  function textToBase64(text) {
    return bytesToBase64(new TextEncoder().encode(text));
  }
  function base64ToText(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  class GitHubError extends Error {
    constructor(message, status) {
      super(message);
      this.name = 'GitHubError';
      this.status = status;
    }
  }

  class GitHubStore {
    constructor({ owner, repo, branch, token }) {
      this.owner = owner;
      this.repo = repo;
      this.branch = branch || '';
      this.token = token;
    }

    async request(path, options = {}) {
      const res = await fetch(API + path, {
        ...options,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: `Bearer ${this.token}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
        cache: 'no-store',
      });
      if (res.status === 204) return null;
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hints = {
          401: 'Token is invalid or expired.',
          403: 'Token does not have permission (needs "Contents: Read and write" on this repository).',
          404: 'Not found — check owner/repo name and that the token can access this repository.',
          409: 'Conflict — the file changed on GitHub. Reload and try again.',
          422: 'GitHub rejected the request (the file may have changed). Reload and try again.',
        };
        throw new GitHubError(hints[res.status] || body.message || `GitHub error ${res.status}`, res.status);
      }
      return body;
    }

    repoPath(suffix = '') {
      return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${suffix}`;
    }

    contentPath(path) {
      return this.repoPath('/contents/' + path.split('/').map(encodeURIComponent).join('/'));
    }

    /** Verifies the token and resolves the branch. Returns repo info. */
    async connect() {
      const repo = await this.request(this.repoPath());
      if (repo.permissions && !repo.permissions.push) {
        throw new GitHubError('This token can read the repository but cannot write to it.', 403);
      }
      if (!this.branch) this.branch = repo.default_branch;
      return repo;
    }

    /** Returns { text, sha } or null if the file does not exist. */
    async getFile(path) {
      try {
        const file = await this.request(`${this.contentPath(path)}?ref=${encodeURIComponent(this.branch)}`);
        if (Array.isArray(file)) throw new GitHubError(`${path} is a directory`, 400);
        if (file.content === '' && file.size > 0 && file.download_url) {
          // Files over 1 MB are not inlined by the contents API.
          const raw = await this.request(this.repoPath(`/git/blobs/${file.sha}`));
          return { text: base64ToText(raw.content), sha: file.sha };
        }
        return { text: base64ToText(file.content || ''), sha: file.sha };
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    }

    async getSha(path) {
      const f = await this.getFile(path);
      return f ? f.sha : null;
    }

    /** Creates or updates a file. `content` is base64. Returns the new file sha + commit. */
    async putFile(path, content, message, sha) {
      const body = { message, content, branch: this.branch };
      if (sha) body.sha = sha;
      const res = await this.request(this.contentPath(path), { method: 'PUT', body: JSON.stringify(body) });
      return { sha: res.content.sha, commit: res.commit };
    }

    putText(path, text, message, sha) {
      return this.putFile(path, textToBase64(text), message, sha);
    }
  }

  global.GitHubStore = GitHubStore;
  global.GitHubError = GitHubError;
  global.b64 = { bytesToBase64, textToBase64, base64ToText };
})(window);
