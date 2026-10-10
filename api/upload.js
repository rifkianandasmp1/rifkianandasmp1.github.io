// POST /api/upload { filename, content (base64) } → commits an image to images/   (admin only)
import { assertSameOrigin, HttpError, json, readJson, route } from './_lib/http.js';
import { requireSession } from './_lib/session.js';
import { putFile, repoConfig } from './_lib/github.js';

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

export const POST = route(async (request) => {
  assertSameOrigin(request);
  requireSession(request);
  const body = await readJson(request, Math.ceil(MAX_BYTES * 1.4) + 4096);
  const bytes = Buffer.from(String(body.content || ''), 'base64');
  if (!bytes.length) throw new HttpError(400, 'Empty file');
  if (bytes.length > MAX_BYTES) throw new HttpError(413, 'Image is larger than 3 MB');
  const type = TYPES.find((t) => t.test(bytes));
  if (!type) throw new HttpError(415, 'Only JPEG, PNG or WebP images are allowed');

  const base = String(body.filename || 'photo')
    .replace(/\.[^.]+$/, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
  const path = `images/${base}-${Date.now().toString(36)}.${type.ext}`;
  await putFile(repoConfig(), path, bytes, `Upload image ${path}`);
  return json(200, { path });
});
