// Serves /robots.txt and /sitemap.xml (see vercel.json rewrites) for whatever domain the site runs on.
import { siteOrigin } from './_lib/http.js';

export function GET(request) {
  const origin = siteOrigin(request);
  const file = new URL(request.url).searchParams.get('file');
  if (file === 'sitemap') {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/</loc></url>
</urlset>
`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  }
  const txt = `User-agent: *\nDisallow: /admin\nDisallow: /admin.html\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
  return new Response(txt, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
