// Small helpers shared by the API routes (files under api/_lib are not deployed as routes).

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Wraps a handler so thrown HttpErrors become JSON responses. */
export function route(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message, ...err.extra });
      console.error(err);
      return json(500, { error: 'Internal server error' });
    }
  };
}

export function parseCookies(request) {
  const out = {};
  const header = request.headers.get('cookie') || '';
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function requestHost(request) {
  return request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
}

/**
 * Blocks cross-site requests to state-changing endpoints (CSRF defence in
 * addition to the SameSite=Strict session cookie).
 */
export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) throw new HttpError(403, 'Missing Origin header');
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Invalid Origin header');
  }
  if (originHost !== requestHost(request)) throw new HttpError(403, 'Cross-origin request blocked');
}

/** Reads a JSON body with a size limit. */
export async function readJson(request, maxBytes) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Expected application/json');
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw new HttpError(413, 'Request body too large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export function siteOrigin(request) {
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  return `${proto}://${requestHost(request)}`;
}
