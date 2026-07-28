import profile from '../data/profile.json';

// One-page site, so the sitemap is just the root URL. If more pages are ever
// added, list them here or switch to @astrojs/sitemap.
export function GET() {
  const siteUrl = 'https://' + (profile.domain || 'example.com');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}/</loc></url>
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
