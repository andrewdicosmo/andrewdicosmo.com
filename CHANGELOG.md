# Changelog

## v1.0.2

- Wide monitors: content band now centers itself once the viewport passes
  ~1520px instead of pinning to the left gutter; timeline column widened.
- Sector radar holds its completed state after the reveal instead of wiping
  and re-scanning every four spins (the beam keeps rotating).
- Hero redactions auto-declassify a beat after the typewriter finishes, so
  the reveal no longer depends on visitors discovering the hover.
- Timeline intel entries: body text one shade brighter and a wider measure.

## v1.0.1

- Fixed a double-executing script: the example DEBRIEF section carried an inline
  copy of main.js alongside the bundled one, which made timeline operations
  impossible to expand and doubled the console log lines and op carets.
- The post-transmit scheduler link now stays hidden unless a bookings URL is
  configured, instead of rendering a dead link.
- Added SEO and link-preview support: canonical URL, favicon, Open Graph and
  Twitter tags, og.png card (source in scripts/og-card.html), Person JSON-LD,
  and robots.txt/sitemap.xml endpoints, all driven by profile.json.
- Unknown paths now return a themed 404 instead of a rewrite to the homepage.
- Keyboard and screen reader access for timeline operations, engagement path
  cards, and redactions.

## v1.0.0

- Initial public release of the Mission Themed Resume Portfolio template.
- Keeps personal portfolio data outside the public code repository.
- Includes the Azure Static Web Apps deployment workflow and Azure Function form handling.
