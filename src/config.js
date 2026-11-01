export const defaults = {
  mode: "catalog",
  trendTags: true,
  qualityTags: false,
  showGenre: true,
  showRating: true,
  ageRating: false,
  ratingSource: "TM",
  lang: "en",
  sort: "shuffle",
  catalogs: ["trending-m", "trending-s", "top"],
};
export const catalogs = [
  ["trending-m", "Trending movies", "TMDB · Movies", "↗"],
  ["trending-s", "Trending series", "TMDB · Series", "↗"],
  ["popular-m", "Popular movies", "TMDB · Movies", "♡"],
  ["popular-s", "Popular series", "TMDB · Series", "♡"],
  ["top", "Top rated", "TMDB · Movies", "★"],
  ["latest-m", "Now playing", "TMDB · Movies", "✦"],
  ["latest-s", "On air", "TMDB · Series", "✦"],
  ["today-m", "Movies trending today", "TMDB · Movies", "◷"],
  ["today-s", "Series trending today", "TMDB · Series", "◷"],
  ["today-a", "Popular anime", "TMDB · Anime", "✧"],
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
export const ratingSources = [["TM", "TMDB"]];
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
  state.qualityTags = false;
  return state;
}
export function validateService(value) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !(url.protocol === "https:" || (local && url.protocol === "http:"))
  )
    throw new Error("Enter the HTTPS root URL of your PosterFlow server.");
  return url.origin;
}
let initialService = import.meta.env?.VITE_API_BASE_URL || "";
if (
  !initialService &&
  globalThis.location &&
  !globalThis.location.hostname.endsWith(".github.io")
)
  initialService = globalThis.location.origin;
export let SERVICE = "";
try {
  if (initialService) SERVICE = validateService(initialService);
} catch {}
export function setService(value) {
  SERVICE = validateService(value);
  return SERVICE;
}
export function encodeState(state) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ v: 1, ...normalizeState(state) }),
  );
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export function posterURL(state, id = "{imdb_id}", base = SERVICE) {
  if (!base) throw new Error("Connect your PosterFlow server first.");
  if (
    id !== "{imdb_id}" &&
    !/^(tt\d{5,12}|tmdb:(?:(movie|series):)?\d{1,10})$/.test(id)
  )
    throw new Error("Invalid title ID.");
  return `${validateService(base)}/v1/${encodeState({ ...state, catalogs: [], mode: "poster" })}/poster/${id}.jpg`;
}
export async function manifestURL(state, base = SERVICE) {
  if (!normalizeState(state).catalogs.length)
    throw new Error("Choose at least one catalog.");
  if (!base) throw new Error("Connect your PosterFlow server first.");
  return `${validateService(base)}/v1/${encodeState(state)}/manifest.json`;
}
