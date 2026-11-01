# PosterFlow

An independently hosted Stremio catalog and poster service. This revision removes the former poster-provider dependency. PosterFlow owns its renderer, HTTP API, addon identity (`community.posterflow`), configuration URLs, caches, and frontend. Metadata and original film artwork come directly from **TMDB**, using the server owner's API Read Access Token.

The English dark UI keeps the original PosterFlow icon and places the preview above the controls.

## Deploy on Render

See **[DEPLOY_RENDER.md](DEPLOY_RENDER.md)** for the complete Arabic guide. The root `render.yaml` creates one Docker web service serving both the UI and backend. `TMDB_READ_TOKEN` is entered securely in Render, never in source control, build arguments, frontend variables, or generated URLs. Render supplies its public service URL automatically. No Render account or token is available to this development session, so a public backend deployment cannot be performed here.

The free Render plan may sleep and have a substantial cold start. Use an appropriate always-on plan if consistent response time is required; caching in this project does not prevent host sleep.

## Run locally

Node.js 24:

```sh
npm ci
npm test
npm run build
TMDB_READ_TOKEN=... npm start
```

Supply the real token securely in your shell/environment; the placeholder above is not a credential. `.env.example` documents names only. `npm start` does not automatically load `.env`. For local env-file usage, run `node --env-file=.env --use-env-proxy server/index.js`. `.env` is ignored by Git.

The server listens on port 3000 by default and serves `dist`. For frontend development, run the server and `npm run dev` in separate sessions. Vite proxies `/api` and `/v1` to the local backend. Use the existing isolated checkout; no extra Git worktree is needed.

Production outside Render requires `PUBLIC_BASE_URL` to be your root HTTPS origin. This trusted value is used in generated links; arbitrary Host or forwarded-host headers do not select the link domain. `TRUST_PROXY=1` is configured for Render; only enable it behind a trusted reverse proxy that appends the actual client IP to X-Forwarded-For.

## Independent endpoints

- `/healthz`: process liveness, without credentials.
- `/readyz`: 503 until TMDB credentials/connectivity can be verified.
- `/api/status`: service identity, verified readiness, capabilities and public URL; no secret values.
- `/v1/{config}/manifest.json`: PosterFlow addon manifest.
- `/v1/{config}/catalog/{movie|series}/{catalog}.json`: public catalogs.
- `/v1/{config}/catalog/{movie|series}/search/search={query}.json`: title search.
- `/v1/{config}/meta/{movie|series}/{imdb-or-tmdb-id}.json`: metadata, with episode lists for series.
- `/v1/{config}/poster/{imdb-or-tmdb-id}.jpg`: our own JPEG renderer, with TMDB genres, community rating, age certification and verified trending status when available.

Configuration is versioned base64url JSON containing only allowlisted preferences. There are no API keys or account tokens in URLs. Rendering, outbound work, request queues and in-memory caches are bounded; simultaneous identical work is shared.

## Validate

```sh
npm test
npm run build
```

`tests/server.test.js` starts real HTTP servers with deterministic source-data fixtures and exercises actual Sharp JPEG output. It tests the addon/catalog/meta path, missing and rejected credentials, invalid requests, cache coalescing and eviction, rate limits, fixed upstream destinations, episode IDs and safe rendering of metadata.

`python tests/browser.py` uses Python Playwright and Chromium at `/usr/bin/chromium`, with mocked own-server responses, to test UI flows and network failures. Set `POSTERFLOW_TEST_URL` to test a static production build rather than the default dev server on port 5173. The suite rejects any request to the former provider.

`POSTERFLOW_API_URL=https://your-own-server python tests/service.py` checks a live deployment, authenticated source readiness, a generated manifest and actual JPEG output. This check needs a running backend with a valid TMDB token; it is not claimed as passed until those are supplied.

## GitHub Pages

Pages can still serve this UI, but **cannot execute the renderer**. After Render deployment, either open the Render URL (the complete independent site), enter that server URL using the UI's Connect form, or set the repository Actions variable `POSTERFLOW_API_URL` and rerun Pages deployment. Never put a TMDB token in a `VITE_` variable. If no server is connected, preview and link generation are unavailable with an explicit setup message; there is no fallback to another poster service.

## Current capability limits

- Ratings are TMDB only. Other rating providers require their own authorized integrations.
- Quality badges are disabled: film metadata alone cannot verify 4K/Dolby/Atmos availability.
- Personal account linking, private lists and watch progress are not implemented. No external account page pretends to connect those features to PosterFlow.
- Public catalogs use TMDB instead of proprietary Trakt/MDBList curated lists. Newest/oldest/shuffle sorts operate on each fetched page, not the entire remote database.
- Poster generation fails explicitly for titles without source artwork. Series without an IMDb ID use TMDB IDs, which some third-party stream addons may not understand. This is a metadata/catalog addon; it does not host or supply video streams.
- At most 40 seasons / 2,000 episodes are returned per series to keep requests bounded.

See [AUDIT.md](AUDIT.md) for current validation boundaries and [DEPLOY_RENDER.md](DEPLOY_RENDER.md) for the remaining deployment steps.
