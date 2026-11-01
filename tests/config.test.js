import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  normalizeState,
  posterURL,
  manifestURL,
  encodeState,
  validateService,
  languages,
  catalogs,
} from "../src/config.js";
import { decodeConfig } from "../server/app.js";
const base = "https://posterflow.example";
test("generated links are exclusively owned PosterFlow endpoints", async () => {
  for (const showGenre of [true, false])
    for (const showRating of [true, false])
      for (const ageRating of [true, false]) {
        const state = { ...defaults, showGenre, showRating, ageRating };
        const url = new URL(posterURL(state, "tt0816692", base));
        assert.equal(url.origin, base);
        assert.ok(url.pathname.endsWith("/poster/tt0816692.jpg"));
        const config = decodeConfig(url.pathname.split("/")[2]);
        assert.equal(config.showGenre, showGenre);
        assert.equal(config.showRating, showRating);
        assert.equal(config.ageRating, ageRating);
        assert.deepEqual(config.catalogs, []);
      }
  const addon = new URL(await manifestURL(defaults, base));
  assert.equal(addon.origin, base);
  assert.ok(addon.pathname.endsWith("/manifest.json"));
  assert.deepEqual(
    decodeConfig(addon.pathname.split("/")[2]).catalogs,
    defaults.catalogs,
  );
  assert.ok(posterURL(defaults, undefined, base).includes("{imdb_id}"));
});
test("URLs contain only supported non-secret settings", () => {
  const state = decodeConfig(
    encodeState({
      ...defaults,
      token: "private",
      qualityTags: true,
      ratingSource: "IM",
      lang: "es-MX",
      catalogs: ["top", "top", "bad"],
    }),
  );
  assert.equal(state.token, undefined);
  assert.equal(state.qualityTags, false);
  assert.equal(state.ratingSource, "TM");
  assert.equal(state.lang, "es-MX");
  assert.deepEqual(state.catalogs, ["top"]);
  assert.equal(catalogs.length, 13);
  assert.ok(languages.some((l) => l[0] === "pt-BR"));
  assert.deepEqual(normalizeState(null), defaults);
  const state2 = normalizeState({});
  state2.catalogs.pop();
  assert.equal(defaults.catalogs.length, 3);
});
test("bad configs, unconnected services and unsafe origins are rejected", async () => {
  for (const token of [
    "a".repeat(4100),
    "%bad",
    Buffer.from("{}").toString("base64url"),
    Buffer.from("null").toString("base64url"),
  ])
    assert.throws(() => decodeConfig(token));
  for (const origin of [
    "javascript:alert(1)",
    "http://public.example",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com?key=secret",
  ])
    assert.throws(() => validateService(origin));
  assert.equal(
    validateService("http://localhost:3000"),
    "http://localhost:3000",
  );
  assert.throws(() => posterURL(defaults, "tt0816692", ""), /Connect/);
  assert.throws(
    () => posterURL(defaults, "https://attacker.example/file", base),
    /Invalid/,
  );
  await assert.rejects(
    () => manifestURL({ ...defaults, catalogs: [] }, base),
    /Choose/,
  );
});
