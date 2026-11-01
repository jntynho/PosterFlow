# PosterFlow

An independent English configuration interface for BetterPosters / Stremio, built with vanilla JavaScript and Vite. White surfaces, soft lavender accents, a horizontal setup flow, responsive layout, accessible native form inputs, and real poster previews.

## Implemented

- Catalog addon and poster-only / AIOMetadata workflows.
- Twelve selectable public catalogs, search, and four sort orders.
- Trend, quality, genre, rating and age badges; eight rating sources and eight languages.
- Live external poster preview, explicit network-failure fallback.
- Locally saved non-secret preferences, reset, compressed compatible manifest URLs, clipboard fallback and Stremio installation link.

## Important scope

This is a working frontend for **https://btttr.cc**, not a self-hosted poster service. The manifest identifies BetterPosters. Preview images, generated manifests, catalogs and installed addon depend on that external provider and its continued availability. No provider code or artwork is bundled. GitHub Pages serves only this frontend. Personal Trakt/MDBList/PublicMetaDB accounts, private lists, discovery and watch progress are not implemented; account management links to the original provider. No API keys or tokens are collected. A fully independent equivalent requires an authorized metadata/image source, backend renderer, caching, and registered OAuth integration. No Stremio installation or account linking was performed during development.

## Develop

Node.js 24 and npm:

```sh
npm ci
npm run dev -- --port 5173
```

Use the existing isolated checkout; no extra Git worktree is needed.

## Validate

```sh
npm test
npm run build
npm run preview -- --port 4173
```

Tests verify URL options and decompress the addon configuration to validate the actual payload. `tests/browser.py` is a supplementary Playwright browser smoke test for a dev server on port 5173. It uses Python Playwright and Chromium at `/usr/bin/chromium`, honors `HTTPS_PROXY`, and checks both workflows, search, saved preferences and overflow at four viewport widths. Run `python tests/browser.py` with the server running. Screenshots go to `/tmp`; no secrets are used. It does not replace end-to-end testing inside a real Stremio client.

## Deploy

The GitHub Pages workflow builds/tests/uploads `dist` on pushes to `main` or manual dispatch. Vite uses relative asset paths for project hosting. The initial version has been pushed to `main`. Set repository **Settings → Pages → Source → GitHub Actions**, then run **Deploy to GitHub Pages** from the Actions tab if needed. Pages activation and public deployment have not yet been verified; GitHub management API requests from this environment are denied.
