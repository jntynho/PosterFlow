export const defaults = { mode: 'catalog', trendTags: true, qualityTags: true, showGenre: true, showRating: true, ageRating: false, ratingSource: 'IM', lang: 'en', sort: 'shuffle', catalogs: ['trending-m','trending-s','top'] };
export const catalogs = [['trending-m','Trending movies','Trakt · Movies','↗'],['trending-s','Trending series','Trakt · Series','↗'],['popular-m','Popular movies','Trakt · Movies','♡'],['popular-s','Popular series','Trakt · Series','♡'],['top','Top rated','TMDB · Movies','★'],['latest-m','New movies','TMDB · Movies','✦'],['latest-s','New series','TMDB · Series','✦'],['today-m','Top 25 movies today','TMDB · Movies','◷'],['today-s','Top 25 series today','TMDB · Series','◷'],['today-a','Top anime today','TMDB · Anime','✧'],['coming-m','Upcoming movies','TMDB · Movies','◷'],['coming-s','Upcoming series','TMDB · Series','◷']];
export const SERVICE = 'https://btttr.cc';
export function posterURL(s, id = '{imdb_id}') {
 let base = s.showGenre && s.showRating ? 'poster' : s.showGenre ? 'poster-g' : s.showRating ? 'poster-r' : 'poster-n';
 const suffix = (s.qualityTags ? 'q' : '') + (s.ageRating ? 'a' : '');
 if (suffix) base += (base.includes('-') ? '' : '-') + suffix;
 const q = new URLSearchParams();
 if (!s.trendTags) q.set('tag', 'none');
 if (s.lang !== 'en') q.set('lang', s.lang);
 if (s.ratingSource !== 'avg') q.set('rs', s.ratingSource);
 return `${SERVICE}/${base}/imdb/poster-default/${id}.jpg${q.size ? '?' + q : ''}`;
}
export async function manifestURL(s) {
 if (!s.catalogs.length) throw new Error('Choose at least one catalog.');
 const config = { catalogs: s.catalogs, meta: {}, poster: { top: s.trendTags ? 'auto' : 'none', progress: false, trendTags: s.trendTags, qualityTags: s.qualityTags, showGenre: s.showGenre, showRating: s.showRating, ageRating: s.ageRating, ratingSource: s.ratingSource, lang: s.lang, sort: s.sort } };
 const stream = new Blob([JSON.stringify(config)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
 const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
 const encoded = btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 return `${SERVICE}/${encoded}/manifest.json`;
}
