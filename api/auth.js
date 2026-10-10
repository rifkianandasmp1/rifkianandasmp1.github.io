// GET    /api/auth  → { authenticated }
// POST   /api/auth  { password } → sets the session cookie
// DELETE /api/auth  → clears the session cookie
import { assertSameOrigin, json, readJson, route } from './_lib/http.js';
import { checkPassword, clearSessionCookie, createSessionCookie, hasValidSession } from './_lib/session.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const GET = route(async (request) => json(200, { authenticated: hasValidSession(request) }));

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const { password } = await readJson(request, 4 * 1024);
  if (!checkPassword(password)) {
    await sleep(800); // slow down guessing
    return json(401, { error: 'Wrong password' });
  }
  return json(200, { authenticated: true }, { 'Set-Cookie': createSessionCookie() });
});

export const DELETE = route(async (request) => {
  assertSameOrigin(request);
  return json(200, { authenticated: false }, { 'Set-Cookie': clearSessionCookie() });
});
