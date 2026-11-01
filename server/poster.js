import sharp from "sharp";
sharp.cache({ memory: 32, files: 0, items: 50 });
sharp.concurrency(2);
export const escapeXML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function ageLabel(data) {
  const movie = data.release_dates?.results
    ?.find((r) => r.iso_3166_1 === "US")
    ?.release_dates?.find((r) => r.certification)?.certification;
  return (
    movie ||
    data.content_ratings?.results?.find((r) => r.iso_3166_1 === "US")?.rating ||
    ""
  );
}
export async function renderPoster(
  source,
  { data },
  config,
  { trending = false } = {},
) {
  const w = 500,
    h = 750;
  const layers = [];
  if (config.trendTags && trending)
    layers.push(
      '<rect x="24" y="24" width="139" height="36" rx="9" fill="#bbabff"/><text x="94" y="48" text-anchor="middle" font-size="16" font-weight="700" fill="#181322">TRENDING</text>',
    );
  const bottom = [];
  if (config.showGenre && data.genres?.length)
    bottom.push(
      data.genres
        .slice(0, 2)
        .map((g) => g.name)
        .join(" · "),
    );
  if (
    config.showRating &&
    Number(data.vote_count) > 0 &&
    Number(data.vote_average) > 0
  )
    bottom.push(`TMDB ${Number(data.vote_average).toFixed(1)}/10`);
  const age = config.ageRating ? ageLabel(data) : "";
  if (age) bottom.push(age);
  if (bottom.length) {
    layers.push(
      '<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101116" stop-opacity="0"/><stop offset=".6" stop-color="#101116" stop-opacity=".9"/><stop offset="1" stop-color="#101116"/></linearGradient></defs><rect x="0" y="590" width="500" height="160" fill="url(#shade)"/>',
    );
    const size = bottom.length > 2 ? 18 : 20;
    bottom
      .slice(0, 3)
      .forEach((line, i) =>
        layers.push(
          `<text x="250" y="${h - 30 - (bottom.length - 1 - i) * 29}" text-anchor="middle" font-size="${size}" fill="#fff">${escapeXML([...line].slice(0, 46).join(""))}</text>`,
        ),
      );
  }
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g font-family="DejaVu Sans,sans-serif">${layers.join("")}</g></svg>`,
  );
  return sharp(source, { limitInputPixels: 4000000, failOn: "error" })
    .resize(w, h, { fit: "cover" })
    .composite([{ input: overlay }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}
