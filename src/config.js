export const defaults = {
  mode: "catalog",
  trendTags: true,
  qualityTags: true,
  showGenre: true,
  showRating: true,
  ageRating: false,
  ratingSource: "IM",
  lang: "en",
  sort: "shuffle",
  catalogs: ["trending-m", "trending-s", "top"],
};
export const catalogs = [
  ["trending-m", "Trending movies", "Trakt · Movies", "↗"],
  ["trending-s", "Trending series", "Trakt · Series", "↗"],
  ["popular-m", "Popular movies", "Trakt · Movies", "♡"],
  ["popular-s", "Popular series", "Trakt · Series", "♡"],
  ["top", "Top rated", "TMDB · Movies", "★"],
  ["latest-m", "New movies", "TMDB · Movies", "✦"],
  ["latest-s", "New series", "TMDB · Series", "✦"],
  ["today-m", "Top 25 movies today", "TMDB · Movies", "◷"],
  ["today-s", "Top 25 series today", "TMDB · Series", "◷"],
  ["today-a", "Top anime today", "TMDB · Anime", "✧"],
  ["coming-m", "Upcoming movies", "TMDB · Movies", "◷"],
  ["coming-s", "Upcoming series", "TMDB · Series", "◷"],
  ["coming-a", "Upcoming anime", "TMDB · Anime", "✧"],
];
export const languages = [
  ["en", "English"],
  ["es-ES", "Spanish (Spain)"],
  ["es-MX", "Spanish (Latin America)"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["pt-BR", "Portuguese (Brazil)"],
  ["pt-PT", "Portuguese (Portugal)"],
  ["pt", "Portuguese"],
  ["it", "Italian"],
  ["nl", "Dutch"],
  ["pl", "Polish"],
  ["ru", "Russian"],
  ["tr", "Turkish"],
  ["ar", "Arabic"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
  ["hi", "Hindi"],
  ["sv", "Swedish"],
  ["cs", "Czech"],
];
export const ratingSources = [
  ["avg", "All sources · average"],
  ["IM", "IMDb"],
  ["TM", "TMDB"],
  ["RT", "Rotten Tomatoes"],
  ["MC", "Metacritic"],
  ["TR", "Trakt"],
  ["LB", "Letterboxd"],
  ["RE", "Roger Ebert"],
];
export function normalizeState(saved) {
  const state = { ...defaults, catalogs: [...defaults.catalogs] };
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return state;
  for (const key of [
    "trendTags",
    "qualityTags",
    "showGenre",
    "showRating",
    "ageRating",
  ])
    if (typeof saved[key] === "boolean") state[key] = saved[key];
  for (const [key, values] of Object.entries({
    mode: ["catalog", "poster"],
    lang: languages.map((l) => l[0]),
    sort: ["shuffle", "original", "newest", "oldest"],
    ratingSource: ratingSources.map((r) => r[0]),
  }))
    if (values.includes(saved[key])) state[key] = saved[key];
  if (Array.isArray(saved.catalogs))
    state.catalogs = [
      ...new Set(
        saved.catalogs.filter((id) => catalogs.some((c) => c[0] === id)),
      ),
    ];
  return state;
}
export const SERVICE = "https://btttr.cc";
export function posterURL(s, id = "{imdb_id}") {
  let base =
    s.showGenre && s.showRating
      ? "poster"
      : s.showGenre
        ? "poster-g"
        : s.showRating
          ? "poster-r"
          : "poster-n";
  const suffix = (s.qualityTags ? "q" : "") + (s.ageRating ? "a" : "");
  if (suffix) base += (base.includes("-") ? "" : "-") + suffix;
  const q = new URLSearchParams();
  if (!s.trendTags) q.set("tag", "none");
  if (s.lang !== "en") q.set("lang", s.lang);
  if (s.ratingSource !== "avg") q.set("rs", s.ratingSource);
  return `${SERVICE}/${base}/imdb/poster-default/${id}.jpg${q.size ? "?" + q : ""}`;
}
export async function manifestURL(s) {
  if (!s.catalogs.length) throw new Error("Choose at least one catalog.");
  const config = {
    catalogs: s.catalogs,
    meta: {},
    poster: {
      top: s.trendTags ? "auto" : "none",
      progress: false,
      trendTags: s.trendTags,
      qualityTags: s.qualityTags,
      showGenre: s.showGenre,
      showRating: s.showRating,
      ageRating: s.ageRating,
      ratingSource: s.ratingSource,
      lang: s.lang,
      sort: s.sort,
    },
  };
  const bytes = await encodeConfig(config);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${SERVICE}/${encoded}/manifest.json`;
}

export async function encodeConfig(config) {
  const raw = new TextEncoder().encode(JSON.stringify(config));
  try {
    const stream = new Blob([raw])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    // BetterPosters also accepts the original, uncompressed JSON configuration.
    return raw;
  }
}
