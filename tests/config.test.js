import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {defaults, posterURL, manifestURL} from '../src/config.js';
test('poster route combinations preserve supported options',()=>{
 for(const showGenre of [true,false])for(const showRating of [true,false])for(const qualityTags of [true,false])for(const ageRating of [true,false]){
 const s={...defaults,lang:'ar',showGenre,showRating,qualityTags,ageRating};
 const u=new URL(posterURL(s,'tt0816692'));
 assert.equal(u.hostname,'btttr.cc');assert.equal(u.searchParams.get('lang'),'ar');
 assert.ok(u.pathname.endsWith('/tt0816692.jpg'));
 const route=u.pathname.split('/')[1];
 assert.equal(route.includes('q'),qualityTags);assert.equal(route.endsWith('a'),ageRating);
 if(!showGenre&&!showRating)assert.ok(route.startsWith('poster-n'));
 }
});
test('external addon configuration round trips all selected settings',async()=>{
 const s={...defaults,lang:'ja',sort:'newest',catalogs:['top','trending-s'],trendTags:false};
 const url=await manifestURL(s);const encoded=new URL(url).pathname.split('/')[1];
 const c=JSON.parse(inflateRawSync(Buffer.from(encoded,'base64url')).toString());
 assert.deepEqual(c.catalogs,s.catalogs);assert.equal(c.poster.lang,'ja');assert.equal(c.poster.sort,'newest');assert.equal(c.poster.top,'none');assert.equal(c.poster.progress,false);assert.equal(c.trakt,undefined);
});
test('empty catalogs cannot create a misleading addon URL',async()=>{await assert.rejects(()=>manifestURL({...defaults,catalogs:[]}),/Choose at least one catalog/);});
test('poster URL preserves template and disables tags',()=>{const u=posterURL({...defaults,trendTags:false,lang:'en',ratingSource:'avg'});assert.ok(u.includes('{imdb_id}'));assert.ok(u.endsWith('?tag=none'));});
