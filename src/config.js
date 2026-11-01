export const defaults = { mode: 'catalog', trendTags: true, qualityTags: true, showGenre: true, showRating: true, ageRating: false, ratingSource: 'IM', lang: 'ar', sort: 'shuffle', catalogs: ['trending-m','trending-s','top'] };
export const catalogs = [['trending-m','الأفلام الرائجة','Trakt · أفلام','↗'],['trending-s','المسلسلات الرائجة','Trakt · مسلسلات','↗'],['popular-m','الأفلام الأكثر شعبية','Trakt · أفلام','♡'],['popular-s','المسلسلات الأكثر شعبية','Trakt · مسلسلات','♡'],['top','الأعلى تقييمًا','TMDB · أفلام','★'],['latest-m','أحدث الأفلام','TMDB · أفلام','✦'],['latest-s','أحدث المسلسلات','TMDB · مسلسلات','✦'],['today-m','أفضل 25 فيلمًا اليوم','TMDB · أفلام','◷'],['today-s','أفضل 25 مسلسلًا اليوم','TMDB · مسلسلات','◷'],['today-a','أفضل الأنمي اليوم','TMDB · أنمي','✧'],['coming-m','أفلام قادمة','TMDB · أفلام','◷'],['coming-s','مسلسلات قادمة','TMDB · مسلسلات','◷']];
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
 if (!s.catalogs.length) throw new Error('اختر قائمة واحدة على الأقل.');
 const config = { catalogs: s.catalogs, meta: {}, poster: { top: s.trendTags ? 'auto' : 'none', progress: false, trendTags: s.trendTags, qualityTags: s.qualityTags, showGenre: s.showGenre, showRating: s.showRating, ageRating: s.ageRating, ratingSource: s.ratingSource, lang: s.lang, sort: s.sort } };
 const stream = new Blob([JSON.stringify(config)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
 const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
 const encoded = btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 return `${SERVICE}/${encoded}/manifest.json`;
}
