// Stateless admin session: an HMAC-signed, HttpOnly cookie.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { HttpError, parseCookies } from './http.js';

export const COOKIE_NAME = 'admin_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const s = process.env.SESSION_SECRET || '';
  if (s.length < 32) throw new HttpError(500, 'Server is not configured: SESSION_SECRET must be at least 32 characters');
  return s;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/** Constant-time comparison against the ADMIN_PASSWORD environment variable. */
export function checkPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (expected.length < 8) throw new HttpError(500, 'Server is not configured: ADMIN_PASSWORD must be at least 8 characters');
  return typeof password === 'string' && safeEqual(password, expected);
}

export function createSessionCookie() {
  const payload = b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS }));
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function hasValidSession(request) {
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function requireSession(request) {
  if (!hasValidSession(request)) throw new HttpError(401, 'Not signed in');
}
