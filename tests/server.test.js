import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createApp, ADDON_ID } from "../server/app.js";
import { defaults, encodeState } from "../src/config.js";
import { Cache, limiter, publicBase } from "../server/runtime.js";
import { TMDBProvider } from "../server/provider.js";
import { escapeXML, renderPoster } from "../server/poster.js";
const fixture = {
  type: "movie",
  data: {
    id: 157336,
    imdb_id: "tt0816692",
    title: "A <film> & title",
    overview: "Fixture overview",
    poster_path: "/poster.jpg",
    release_date: "2014-11-07",
    genres: [{ name: "Adventure & Sci-Fi" }],
    vote_average: 8.6,
    vote_count: 150,
    release_dates: {
      results: [
        { iso_3166_1: "US", release_dates: [{ certification: "PG-13" }] },
      ],
    },
  },
};
async function setup(t, extra = {}) {
  const image = await sharp({
    create: { width: 500, height: 750, channels: 3, background: "#404060" },
  })
    .jpeg()
    .toBuffer();
  let renders = 0;
  const provider = {
    ready: true,
    health: async () => true,
    resolve: async (id) => {
      if (!/^(tt\d+|tmdb:)/.test(id)) {
        const e = new Error();
        throw e;
      }
      return fixture;
    },
    image: async () => {
      renders++;
      return image;
    },
    isTrending: async () => true,
    catalog: async () => ({ type: "movie", items: [fixture] }),
    ...extra.provider,
  };
  const app = createApp({
    baseUrl: "https://owned.example",
    provider,
    ...extra,
  });
  app.listen(0, "127.0.0.1");
  await new Promise((resolve) => app.once("listening", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        app.close(resolve);
        app.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${app.address().port}`;
  const prefix = `/v1/${encodeState(defaults)}`;
  return { base, prefix, app, provider, image, renders: () => renders };
}
test("owned addon, catalog, metadata and real JPEG renderer work end to end", async (t) => {
  const { base, prefix, renders } = await setup(t);
  let r = await fetch(base + "/api/status");
  const status = await r.json();
  assert.equal(status.ready, true);
  assert.equal(status.addonId, ADDON_ID);
  assert.equal(status.publicBaseUrl, "https://owned.example");
  r = await fetch(base + prefix + "/manifest.json");
  const manifest = await r.json();
  assert.equal(manifest.id, "community.posterflow");
  assert.equal(manifest.name, "PosterFlow");
  assert.ok(manifest.catalogs.some((c) => c.id === "search"));
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  r = await fetch(base + prefix + "/catalog/movie/top.json");
  const catalog = await r.json();
  assert.equal(catalog.metas[0].id, "tt0816692");
  assert.ok(catalog.metas[0].poster.startsWith("https://owned.example/v1/"));
  r = await fetch(base + prefix + "/meta/movie/tt0816692.json");
  const meta = await r.json();
  assert.equal(meta.meta.behaviorHints.defaultVideoId, "tt0816692");
  const urls = Array.from({ length: 4 }, () =>
    fetch(base + prefix + "/poster/tt0816692.jpg"),
  );
  const responses = await Promise.all(urls);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    const bytes = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, 500);
    assert.equal(metadata.height, 750);
    assert.ok(bytes.length > 1000);
  }
  assert.equal(renders(), 1, "concurrent identical renders must share work");
});
test("invalid paths, pagination, unselected catalogs and methods fail explicitly", async (t) => {
  const { base, prefix } = await setup(t);
  for (const route of [
    "/v1/bad/manifest.json",
    prefix + "/catalog/movie/unknown.json",
    prefix + "/poster/https:attacker.jpg",
    prefix + "/catalog/movie/top/skip=-1.json",
  ]) {
    const r = await fetch(base + route);
    assert.ok([400, 404].includes(r.status), route);
  }
  assert.equal(
    (await fetch(base + "/healthz", { method: "POST" })).status,
    405,
  );
  assert.equal(
    (await fetch(base + "/api/status", { method: "OPTIONS" })).status,
    204,
  );
  assert.equal((await fetch(base + "/.env")).status, 404);
  const search = await fetch(base + prefix + "/catalog/movie/search.json");
  assert.deepEqual(await search.json(), { metas: [] });
});
test("missing or rejected provider credentials cannot be reported as ready", async (t) => {
  const { base, prefix } = await setup(t, { provider: { ready: false } });
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/readyz")).status, 503);
  assert.equal((await (await fetch(base + "/api/status")).json()).ready, false);
  assert.equal((await fetch(base + prefix + "/manifest.json")).status, 503);
  const second = await setup(t, {
    provider: {
      ready: true,
      health: async () => {
        throw new Error("rejected");
      },
    },
  });
  assert.equal(
    (await (await fetch(second.base + "/api/status")).json()).ready,
    false,
  );
});
test("rate limiting is bounded and ignores untrusted forwarding headers", async (t) => {
  const { base, prefix } = await setup(t, { rateLimit: 1 });
  assert.equal((await fetch(base + prefix + "/manifest.json")).status, 200);
  const r = await fetch(base + prefix + "/manifest.json", {
    headers: { "x-forwarded-for": "1.2.3.4" },
  });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "60");
});
test("cache coalesces requests and expires/evicts within its memory budget", async () => {
  let now = 0,
    calls = 0;
  const cache = new Cache({ maxEntries: 2, maxBytes: 20, now: () => now });
  const load = () =>
    cache.load("a", 5, async () => {
      calls++;
      return Buffer.alloc(8);
    });
  await Promise.all([load(), load()]);
  assert.equal(calls, 1);
  cache.set("b", Buffer.alloc(8), 5);
  cache.set("c", Buffer.alloc(8), 5);
  assert.equal(cache.get("a"), undefined);
  assert.ok(cache.bytes <= 20);
  now = 6;
  assert.equal(cache.get("b"), undefined);
  const limit = limiter(1, 0);
  let resolve;
  const pending = limit(() => new Promise((r) => (resolve = r)));
  await assert.rejects(() => limit(async () => 1), /busy/);
  resolve();
  await pending;
});
test("TMDB adapter sends credentials only to its fixed API and validates image paths", async () => {
  const requests = [];
  const image = await sharp({
    create: { width: 20, height: 30, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  const fetcher = async (input, options) => {
    const url = new URL(input);
    requests.push({ url, options });
    if (url.hostname === "image.tmdb.org")
      return new Response(image, { headers: { "content-type": "image/jpeg" } });
    const body = url.pathname.endsWith("/configuration")
      ? { images: { secure_base_url: "https://image.tmdb.org/" } }
      : url.pathname.includes("/find/")
        ? { movie_results: [{ id: 157336 }] }
        : url.pathname.includes("/season/")
          ? {
              episodes: [
                {
                  season_number: 1,
                  episode_number: 1,
                  name: "Pilot",
                  air_date: "2020-01-01",
                },
              ],
            }
          : url.pathname.includes("/trending/")
            ? { results: [{ id: 157336 }] }
            : fixture.data;
    return Response.json(body);
  };
  const provider = new TMDBProvider({ token: "test-only-token", fetcher });
  assert.equal(await provider.health(), true);
  assert.equal((await provider.resolve("tt0816692")).data.id, 157336);
  assert.equal(await provider.isTrending("movie", 157336), true);
  await provider.image("/poster.jpg");
  await assert.rejects(
    () => provider.image("https://attacker.example/a.jpg"),
    /No source/,
  );
  await assert.rejects(() => provider.resolve("../config"), /Invalid/);
  const series = {
    type: "series",
    data: {
      id: 10,
      seasons: [{ season_number: 1 }],
      external_ids: { imdb_id: "tt1234567" },
    },
  };
  const episodes = await provider.episodes(series, "en");
  assert.equal(episodes[0].id, "tt1234567:1:1");
  assert.ok(
    requests.every((r) =>
      ["api.themoviedb.org", "image.tmdb.org"].includes(r.url.hostname),
    ),
  );
  for (const request of requests.filter(
    (r) => r.url.hostname === "image.tmdb.org",
  ))
    assert.equal(request.options.headers, undefined);
});
test("renderer escapes metadata and only draws supported, available information", async () => {
  assert.equal(escapeXML('<script>&"'), "&lt;script&gt;&amp;&quot;");
  const image = await sharp({
    create: { width: 500, height: 750, channels: 3, background: "#404060" },
  })
    .jpeg()
    .toBuffer();
  const plain = await renderPoster(image, fixture, {
    ...defaults,
    showGenre: false,
    showRating: false,
    trendTags: false,
  });
  const decorated = await renderPoster(
    image,
    fixture,
    { ...defaults, ageRating: true },
    { trending: true },
  );
  assert.notDeepEqual(plain, decorated);
  assert.equal((await sharp(decorated).metadata()).format, "jpeg");
  assert.throws(() => publicBase("https://attacker.example/path"), /root/);
});
