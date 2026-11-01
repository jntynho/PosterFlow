import { Cache, limiter, ServiceError } from "./runtime.js";
const API = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p/w500";
const DAY = 86400000;
export const catalogDefinitions = [
  ["trending-m", "movie", "Trending movies", "/trending/movie/week"],
  ["trending-s", "series", "Trending series", "/trending/tv/week"],
  ["popular-m", "movie", "Popular movies", "/movie/popular"],
  ["popular-s", "series", "Popular series", "/tv/popular"],
  ["top", "movie", "Top rated movies", "/movie/top_rated"],
  ["latest-m", "movie", "Now playing", "/movie/now_playing"],
  ["latest-s", "series", "On air", "/tv/on_the_air"],
  ["today-m", "movie", "Movies trending today", "/trending/movie/day"],
  ["today-s", "series", "Series trending today", "/trending/tv/day"],
  ["today-a", "series", "Popular anime", "/discover/tv"],
  ["coming-m", "movie", "Upcoming movies", "/movie/upcoming"],
  ["coming-s", "series", "Upcoming series", "/discover/tv"],
  ["coming-a", "series", "Upcoming anime", "/discover/tv"],
];
export class TMDBProvider {
  constructor({
    token = process.env.TMDB_READ_TOKEN,
    fetcher = fetch,
    now = Date.now,
  } = {}) {
    this.token = token;
    this.ready = !!token;
    this.fetcher = fetcher;
    this.now = now;
    this.cache = new Cache({ maxBytes: 20 * 1024 * 1024, now });
    this.imageCache = new Cache({
      maxEntries: 40,
      maxBytes: 24 * 1024 * 1024,
      now,
    });
    this.run = limiter(6, 96);
  }
  async health() {
    const data = await this.request("/configuration");
    if (!data.images?.secure_base_url)
      throw new ServiceError(502, "TMDB credentials could not be verified.");
    return true;
  }
  async episodes(item, lang) {
    const { data, type } = item;
    if (type !== "series") return [];
    const imdb = data.external_ids?.imdb_id;
    const seasons = (data.seasons || [])
      .filter((s) => s.season_number > 0)
      .slice(0, 40);
    const all = await Promise.all(
      seasons.map((s) =>
        this.request(`/tv/${data.id}/season/${s.season_number}`, {
          language: lang,
        }),
      ),
    );
    return all
      .flatMap((season) =>
        (season.episodes || []).map((e) => ({
          id: imdb
            ? `${imdb}:${e.season_number}:${e.episode_number}`
            : `tmdb:series:${data.id}:${e.season_number}:${e.episode_number}`,
          title: e.name || `Episode ${e.episode_number}`,
          season: e.season_number,
          episode: e.episode_number,
          ...(e.air_date
            ? { released: new Date(e.air_date).toISOString() }
            : {}),
        })),
      )
      .slice(0, 2000);
  }
  async request(path, params = {}) {
    if (!this.ready)
      throw new ServiceError(
        503,
        "Add TMDB_READ_TOKEN to the server environment to enable movie data.",
      );
    const url = new URL(API + path);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    return this.cache.load(url.href, 600000, () =>
      this.run(async () => {
        let response;
        try {
          response = await this.fetcher(url, {
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          });
        } catch {
          throw new ServiceError(
            502,
            "The movie data provider could not be reached. Please retry.",
          );
        }
        if (!response.ok)
          throw new ServiceError(
            response.status === 404 ? 404 : 502,
            response.status === 404
              ? "Title not found."
              : "The movie data provider rejected the request. Check the server credentials or retry later.",
          );
        const size = Number(response.headers.get("content-length") || 0);
        if (size > 4000000)
          throw new ServiceError(502, "Movie data response was too large.");
        const text = await response.text();
        if (Buffer.byteLength(text) > 4000000)
          throw new ServiceError(502, "Movie data response was too large.");
        try {
          return JSON.parse(text);
        } catch {
          throw new ServiceError(502, "Invalid movie data response.");
        }
      }),
    );
  }
  async detail(type, id, lang) {
    const segment = type === "series" ? "tv" : "movie";
    return this.request(`/${segment}/${id}`, {
      language: lang,
      append_to_response: "external_ids,release_dates,content_ratings",
    });
  }
  async resolve(id, type = "movie", lang = "en") {
    if (/^tt\d{5,12}$/.test(id)) {
      const found = await this.request(`/find/${id}`, {
        external_source: "imdb_id",
        language: lang,
      });
      const movie = found.movie_results?.[0],
        series = found.tv_results?.[0];
      const item = type === "series" ? series || movie : movie || series;
      if (!item) throw new ServiceError(404, "Title not found.");
      type = item === movie ? "movie" : "series";
      return { type, data: await this.detail(type, item.id, lang) };
    }
    const match = /^tmdb:(?:(movie|series):)?(\d{1,10})$/.exec(id);
    if (!match)
      throw new ServiceError(400, "Invalid title ID. Use an IMDb or TMDB ID.");
    type = match[1] || type;
    return { type, data: await this.detail(type, match[2], lang) };
  }
  async isTrending(type, id) {
    const data = await this.request(
      `/trending/${type === "series" ? "tv" : "movie"}/week`,
    );
    return (data.results || []).some((item) => item.id === id);
  }
  async catalog(id, skip, lang, sort, search = "") {
    const def = catalogDefinitions.find((d) => d[0] === id);
    const type =
      id === "search-series"
        ? "series"
        : id === "search-movie"
          ? "movie"
          : def?.[1];
    if (!type) throw new ServiceError(404, "Catalog not found.");
    const params = {
      language: lang,
      page: Math.floor(skip / 20) + 1,
      include_adult: "false",
    };
    let path = def?.[3];
    if (search) {
      path = `/search/${type === "series" ? "tv" : "movie"}`;
      params.query = search;
    }
    if (id === "today-a" || id === "coming-a") {
      params.with_genres = "16";
      params.with_original_language = "ja";
    }
    if (id === "coming-s" || id === "coming-a") {
      params["first_air_date.gte"] = new Date(this.now())
        .toISOString()
        .slice(0, 10);
      params.sort_by = "first_air_date.asc";
    }
    const payload = await this.request(path, params);
    if (!Array.isArray(payload.results))
      throw new ServiceError(502, "Invalid catalog response.");
    let results = payload.results.slice(skip % 20);
    if (sort === "newest" || sort === "oldest")
      results.sort(
        (a, b) =>
          (sort === "newest" ? -1 : 1) *
          String(a.release_date || a.first_air_date || "").localeCompare(
            b.release_date || b.first_air_date || "",
          ),
      );
    if (sort === "shuffle" && !search) {
      let seed = Math.floor(this.now() / 3600000) + Math.floor(skip / 20);
      for (let i = results.length - 1; i > 0; i--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [results[i], results[j]] = [results[j], results[i]];
      }
    }
    return {
      type,
      items: await Promise.all(
        results.slice(0, 20).map(async (item) => {
          const data = await this.detail(type, item.id, lang);
          return { type, data };
        }),
      ),
    };
  }
  async image(path) {
    if (typeof path !== "string" || !/^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(path))
      throw new ServiceError(
        404,
        "No source poster is available for this title.",
      );
    return this.imageCache.load(path, DAY, () =>
      this.run(async () => {
        let response;
        try {
          response = await this.fetcher(IMAGE + path, {
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          });
        } catch {
          throw new ServiceError(502, "The source poster could not be loaded.");
        }
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/")
        )
          throw new ServiceError(502, "The source poster is unavailable.");
        const reader = response.body.getReader();
        const parts = [];
        let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 8 * 1024 * 1024) {
              await reader.cancel();
              throw new ServiceError(502, "The source poster is too large.");
            }
            parts.push(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }
        return Buffer.concat(parts);
      }),
    );
  }
}
