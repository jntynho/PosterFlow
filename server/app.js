import http from "node:http";
import { isIP } from "node:net";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { normalizeState, posterURL } from "../src/config.js";
import { TMDBProvider, catalogDefinitions } from "./provider.js";
import { renderPoster } from "./poster.js";
import { Cache, limiter, ServiceError, publicBase } from "./runtime.js";
export const ADDON_ID = "community.posterflow";
export function decodeConfig(token) {
  if (
    typeof token !== "string" ||
    token.length > 4096 ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  )
    throw new ServiceError(400, "Invalid configuration.");
  let raw;
  try {
    raw = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new ServiceError(400, "Invalid configuration.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.v !== 1)
    throw new ServiceError(400, "Unsupported configuration version.");
  return normalizeState(raw);
}
export function buildManifest(config, base) {
  return {
    id: ADDON_ID,
    version: "1.0.0",
    name: "PosterFlow",
    description:
      "Your own movie catalogs and custom poster renderer. Metadata and source images by TMDB.",
    logo: base + "/favicon.svg",
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    idPrefixes: ["tt", "tmdb:"],
    catalogs: [
      ...catalogDefinitions
        .filter((d) => config.catalogs.includes(d[0]))
        .map(([id, type, name]) => ({
          id,
          type,
          name,
          extra: [{ name: "skip", isRequired: false }],
        })),
      ...["movie", "series"].map((type) => ({
        id: "search",
        type,
        name: "PosterFlow search",
        extra: [
          { name: "search", isRequired: true },
          { name: "skip", isRequired: false },
        ],
      })),
    ],
    behaviorHints: { configurable: false, configurationRequired: false },
  };
}
function makeMeta(item, config, base) {
  const { data, type } = item;
  const imdb = data.imdb_id || data.external_ids?.imdb_id;
  const id = imdb || `tmdb:${type}:${data.id}`;
  return {
    id,
    type,
    name: data.title || data.name || "Untitled",
    poster: posterURL(config, id, base),
    posterShape: "poster",
    description: data.overview || "",
    releaseInfo: (data.release_date || data.first_air_date || "").slice(0, 4),
    genres: (data.genres || []).map((g) => g.name),
    ...(imdb ? { imdb_id: imdb, behaviorHints: { defaultVideoId: imdb } } : {}),
  };
}
export function createApp({
  provider = new TMDBProvider(),
  baseUrl = "http://localhost:3000",
  staticRoot = fileURLToPath(new URL("../dist/", import.meta.url)),
  now = Date.now,
  rateLimit = 240,
  trustProxy = false,
} = {}) {
  const base = publicBase(baseUrl, { allowLocal: true }),
    posters = new Cache({ maxEntries: 100, maxBytes: 48 * 1024 * 1024, now }),
    render = limiter(3, 30),
    clients = new Map();
  const send = (
    res,
    status,
    body,
    type = "application/json; charset=utf-8",
    ttl = 0,
  ) => {
    const payload = Buffer.isBuffer(body)
      ? body
      : Buffer.from(
          type.startsWith("application/json") ? JSON.stringify(body) : body,
        );
    const etag =
      '"' + createHash("sha256").update(payload).digest("base64url") + '"';
    res.writeHead(status, {
      "Content-Type": type,
      "Content-Length": payload.length,
      "Cache-Control": ttl ? `public, max-age=${ttl}` : "no-store",
      ...(ttl ? { ETag: etag } : {}),
    });
    res.end(payload);
  };
  return http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: http://localhost:* http://127.0.0.1:*; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD, OPTIONS");
      send(res, 405, { error: "Method not allowed." });
      return;
    }
    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      if (req.url.length > 7000)
        throw new ServiceError(414, "URL is too long.");
      if (pathname === "/healthz") {
        send(res, 200, { ok: true, service: "PosterFlow" });
        return;
      }
      if (pathname === "/api/status" || pathname === "/readyz") {
        let ready = provider.ready;
        if (ready && provider.health) {
          try {
            await provider.health();
          } catch {
            ready = false;
          }
        }
        send(res, pathname === "/readyz" && !ready ? 503 : 200, {
          service: "PosterFlow",
          addonId: ADDON_ID,
          version: 1,
          ready,
          publicBaseUrl: base,
          ratingSources: ["TM"],
          features: { qualityTags: false, accounts: false },
          message: ready
            ? "Ready"
            : "The server owner must configure TMDB_READ_TOKEN.",
        });
        return;
      }
      if (pathname.startsWith("/v1/")) {
        if (!provider.ready)
          throw new ServiceError(
            503,
            "The PosterFlow server needs a TMDB read token before it can generate live posters or catalogs.",
          );
        const forwarded = String(req.headers["x-forwarded-for"] || "")
          .split(",")
          .at(-1)
          .trim();
        const ip =
          trustProxy && isIP(forwarded)
            ? forwarded
            : req.socket.remoteAddress || "unknown";
        const time = now();
        let item = clients.get(ip);
        if (!item || time >= item.reset)
          item = { count: 0, reset: time + 60000 };
        item.count++;
        clients.delete(ip);
        clients.set(ip, item);
        if (clients.size > 2048) clients.delete(clients.keys().next().value);
        if (item.count > rateLimit) {
          res.setHeader("Retry-After", "60");
          throw new ServiceError(
            429,
            "Too many requests. Please retry in a minute.",
          );
        }
        const match = /^\/v1\/([A-Za-z0-9_-]+)\/(.+)$/.exec(pathname);
        if (!match) throw new ServiceError(404, "Endpoint not found.");
        const config = decodeConfig(match[1]),
          route = match[2];
        if (route === "manifest.json") {
          if (!config.catalogs.length)
            throw new ServiceError(400, "Choose at least one catalog.");
          send(
            res,
            200,
            buildManifest(config, base),
            "application/json; charset=utf-8",
            300,
          );
          return;
        }
        const poster = /^poster\/([^/]+)\.jpg$/.exec(route);
        if (poster) {
          const id = poster[1];
          if (!/^(tt\d{5,12}|tmdb:(?:(movie|series):)?\d{1,10})$/.test(id))
            throw new ServiceError(400, "Invalid title ID.");
          const hour = Math.floor(now() / 3600000);
          const image = await posters.load(
            `${match[1]}:${id}:${hour}`,
            3600000,
            () =>
              render(async () => {
                const item = await provider.resolve(id, "movie", config.lang);
                const source = await provider.image(item.data.poster_path);
                const trending = config.trendTags
                  ? await provider.isTrending(item.type, item.data.id)
                  : false;
                return renderPoster(source, item, config, { trending });
              }),
          );
          send(res, 200, image, "image/jpeg", 3600);
          return;
        }
        const catalog =
          /^catalog\/(movie|series)\/([A-Za-z0-9-]+)(?:\/([^/]+))?\.json$/.exec(
            route,
          );
        if (catalog) {
          let [, type, id, extra = ""] = catalog;
          const params = new URLSearchParams(extra);
          const skip = Number(params.get("skip") || 0),
            search = (params.get("search") || "").trim();
          if (
            !Number.isInteger(skip) ||
            skip < 0 ||
            skip > 9980 ||
            search.length > 150
          )
            throw new ServiceError(400, "Invalid catalog request.");
          if (id === "search") {
            if (!search) {
              send(res, 200, { metas: [] });
              return;
            }
            id = "search-" + type;
          } else if (
            !config.catalogs.includes(id) ||
            !catalogDefinitions.some((d) => d[0] === id && d[1] === type)
          )
            throw new ServiceError(
              404,
              "Catalog not found in this configuration.",
            );
          const response = await provider.catalog(
            id,
            skip,
            config.lang,
            config.sort,
            search,
          );
          send(
            res,
            200,
            {
              metas: response.items.map((item) => makeMeta(item, config, base)),
            },
            "application/json; charset=utf-8",
            600,
          );
          return;
        }
        const meta = /^meta\/(movie|series)\/([^/]+)\.json$/.exec(route);
        if (meta) {
          const item = await provider.resolve(meta[2], meta[1], config.lang);
          const result = makeMeta(item, config, base);
          if (item.type === "series" && provider.episodes)
            result.videos = await provider.episodes(item, config.lang);
          send(
            res,
            200,
            { meta: result },
            "application/json; charset=utf-8",
            3600,
          );
          return;
        }
        throw new ServiceError(404, "Endpoint not found.");
      }
      const requested = pathname === "/" ? "/index.html" : pathname;
      const root = path.resolve(staticRoot);
      const file = path.resolve(root, "." + requested);
      if (
        !file.startsWith(root + path.sep) ||
        requested.includes("\\") ||
        requested.split("/").some((part) => part.startsWith("."))
      )
        throw new ServiceError(404, "File not found.");
      let info;
      try {
        info = await stat(file);
      } catch {
        throw new ServiceError(404, "File not found.");
      }
      if (!info.isFile()) throw new ServiceError(404, "File not found.");
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
      };
      const body = await readFile(file);
      send(
        res,
        200,
        body,
        types[path.extname(file)] || "application/octet-stream",
        pathname.startsWith("/assets/") ? 31536000 : 0,
      );
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof URIError) {
        send(res, 400, { error: "Invalid URL encoding." });
        return;
      }
      const status = error instanceof ServiceError ? error.status : 502;
      if (status === 503) res.setHeader("Retry-After", "5");
      send(res, status, {
        error:
          error instanceof ServiceError
            ? error.message
            : "The request could not be completed. Please retry.",
      });
    }
  });
}
