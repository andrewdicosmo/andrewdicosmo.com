# Changelog

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
