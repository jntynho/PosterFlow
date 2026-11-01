import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { defaults, posterURL, manifestURL } from "../src/config.js";
test("poster route combinations preserve supported options", () => {
  for (const showGenre of [true, false])
    for (const showRating of [true, false])
      for (const qualityTags of [true, false])
        for (const ageRating of [true, false]) {
          const s = {
            ...defaults,
            lang: "ar",
            showGenre,
            showRating,
            qualityTags,
            ageRating,
          };
          const u = new URL(posterURL(s, "tt0816692"));
          assert.equal(u.hostname, "btttr.cc");
          assert.equal(u.searchParams.get("lang"), "ar");
          assert.ok(u.pathname.endsWith("/tt0816692.jpg"));
          const route = u.pathname.split("/")[1];
          assert.equal(route.includes("q"), qualityTags);
          assert.equal(route.endsWith("a"), ageRating);
          if (!showGenre && !showRating)
            assert.ok(route.startsWith("poster-n"));
        }
});
test("external addon configuration round trips all selected settings", async () => {
  const s = {
    ...defaults,
    lang: "ja",
    sort: "newest",
    catalogs: ["top", "trending-s"],
    trendTags: false,
  };
  const url = await manifestURL(s);
  const encoded = new URL(url).pathname.split("/")[1];
  const c = JSON.parse(
    inflateRawSync(Buffer.from(encoded, "base64url")).toString(),
  );
  assert.deepEqual(c.catalogs, s.catalogs);
  assert.equal(c.poster.lang, "ja");
  assert.equal(c.poster.sort, "newest");
  assert.equal(c.poster.top, "none");
  assert.equal(c.poster.progress, false);
  assert.equal(c.trakt, undefined);
});
test("empty catalogs cannot create a misleading addon URL", async () => {
  await assert.rejects(
    () => manifestURL({ ...defaults, catalogs: [] }),
    /Choose at least one catalog/,
  );
});
test("poster URL preserves template and disables tags", () => {
  const u = posterURL({
    ...defaults,
    trendTags: false,
    lang: "en",
    ratingSource: "avg",
  });
  assert.ok(u.includes("{imdb_id}"));
  assert.ok(u.endsWith("?tag=none"));
});

test("normalization rejects malformed preferences and deduplicates catalogs", async () => {
  const { normalizeState, languages, catalogs } =
    await import("../src/config.js");
  const state = normalizeState({
    mode: "<script>",
    lang: "invalid",
    qualityTags: "false",
    catalogs: ["top", "top", "missing", null],
  });
  assert.equal(state.mode, "catalog");
  assert.equal(state.lang, "en");
  assert.equal(state.qualityTags, true);
  assert.deepEqual(state.catalogs, ["top"]);
  assert.equal(catalogs.length, 13);
  assert.ok(languages.some((l) => l[0] === "es-MX"));
  assert.ok(languages.some((l) => l[0] === "pt-BR"));
  assert.deepEqual(normalizeState(null), defaults);
  assert.deepEqual(normalizeState([]), defaults);
  const clone = normalizeState({});
  clone.catalogs.pop();
  assert.equal(defaults.catalogs.length, 3);
});
test("older browsers produce the supported plain JSON configuration", async () => {
  const { encodeConfig } = await import("../src/config.js");
  const original = globalThis.CompressionStream;
  try {
    globalThis.CompressionStream = undefined;
    const c = { catalogs: ["top"], meta: {} };
    assert.deepEqual(
      JSON.parse(new TextDecoder().decode(await encodeConfig(c))),
      c,
    );
  } finally {
    globalThis.CompressionStream = original;
  }
});
test("every poster option combination yields the complete expected route", () => {
  for (const showGenre of [true, false])
    for (const showRating of [true, false])
      for (const qualityTags of [true, false])
        for (const ageRating of [true, false]) {
          const state = {
            ...defaults,
            showGenre,
            showRating,
            qualityTags,
            ageRating,
          };
          const stem =
            showGenre && showRating
              ? "poster"
              : showGenre
                ? "poster-g"
                : showRating
                  ? "poster-r"
                  : "poster-n";
          const tail = (qualityTags ? "q" : "") + (ageRating ? "a" : "");
          const expected =
            stem + (tail ? (stem.includes("-") ? "" : "-") + tail : "");
          assert.equal(
            new URL(posterURL(state, "tt0816692")).pathname,
            `/${expected}/imdb/poster-default/tt0816692.jpg`,
          );
        }
});
