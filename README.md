# dakcoe.github.io

Personal site for Suhyun (@dakcoe).

## What it is

A single-screen intro page with two interactive project views:

- **dev-news** — the day's collected articles arrive as cards. Hovering a card drops it
  out of the lattice; dropped cards fall, tilt, collide and stack. Cards can be picked up
  and thrown. Physics is [matter-js](https://brm.io/matter-js/); each rigid body drives one
  DOM element through `transform` only, so the work stays on the compositor.
- **study-assistant** — a browser recreation of the desktop app, with a mock lecture page
  behind it. Transcription streams in a line at a time, translation follows. The window
  opacity and Always-on-Top behaviour mirror the real app's settings.

## Data

Nothing here is invented.

- Article cards are fetched live from `dev-news.net` (the current month's search index).
  `assets/data/cards-fallback.json` is used if that request fails.
- Repository count comes from the GitHub REST API at page load.
- The contribution calendar needs an authenticated GraphQL call, so it is baked into
  `assets/data/github.json` at build time. Re-run the build step to refresh it.
- Colours are lifted from the two projects' own source: dev-news uses its site tokens,
  the study-assistant demo uses the constants in that app's `main.py`.

## Third-party marks

`assets/ecoprobm.png` is EcoPro BM's own logo file, taken from
`ecoprobm.com/ecoprobm/images/korean/common/logo.png` and cropped to the mark.
It identifies a past employer and nothing here is affiliated with or endorsed
by EcoPro BM. The mark was not redrawn.

## Layout

Static files, no build step. GitHub Pages serves the repository root.
