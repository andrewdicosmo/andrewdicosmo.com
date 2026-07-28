import profile from '../data/profile.json';

// Static-file endpoint: Astro writes this out as /robots.txt at build time.
// The domain comes from profile.json so forks don't ship someone else's URLs.
export function GET() {
  const siteUrl = 'https://' + (profile.domain || 'example.com');
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}
