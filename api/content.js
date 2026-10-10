// GET /api/content → { data, sha }                      (admin only)
// PUT /api/content { data, baseSha, message, force } → commits data/portfolio.json
import { assertSameOrigin, HttpError, json, readJson, route } from './_lib/http.js';
import { requireSession } from './_lib/session.js';
import { getFile, putFile, repoConfig } from './_lib/github.js';

const DATA_PATH = 'data/portfolio.json';
const LIST_KEYS = ['experience', 'projects', 'education', 'skills', 'training'];

function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Data must be an object');
  if (!data.profile || typeof data.profile !== 'object') throw new HttpError(400, 'Data is missing "profile"');
  for (const key of LIST_KEYS) {
    if (data[key] !== undefined && !Array.isArray(data[key])) throw new HttpError(400, `"${key}" must be a list`);
  }
}

function today() {
  // Date in Jakarta time, as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

export const GET = route(async (request) => {
  requireSession(request);
  const cfg = repoConfig();
  const file = await getFile(cfg, DATA_PATH);
  if (!file) return json(200, { data: null, sha: null });
  let data;
  try {
    data = JSON.parse(file.text);
  } catch {
    throw new HttpError(500, `${DATA_PATH} in the repository is not valid JSON`);
  }
  return json(200, { data, sha: file.sha });
});

export const PUT = route(async (request) => {
  assertSameOrigin(request);
  requireSession(request);
  const body = await readJson(request, 512 * 1024);
  const { data, baseSha, force } = body;
  validate(data);
  const message = String(body.message || 'Update portfolio content').slice(0, 200);

  const cfg = repoConfig();
  const latest = await getFile(cfg, DATA_PATH);
  const latestSha = latest ? latest.sha : null;
  if (!force && baseSha && latestSha && baseSha !== latestSha) {
    throw new HttpError(409, 'The portfolio data changed since you started editing.', { conflict: true, latestSha });
  }

  const next = { ...data, meta: { ...(data.meta || {}), updated: today() } };
  const text = JSON.stringify(next, null, 2) + '\n';
  const result = await putFile(cfg, DATA_PATH, Buffer.from(text, 'utf8'), message, latestSha || undefined);
  return json(200, { data: next, sha: result.sha, commitUrl: result.commitUrl });
});
