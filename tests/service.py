"""Optional live BetterPosters smoke test (requires network access)."""
from pathlib import Path
import json, subprocess
root=Path(__file__).resolve().parents[1]
urls=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
import {defaults,catalogs,posterURL,manifestURL} from './src/config.js';
const state={...defaults,catalogs:catalogs.map(c=>c[0])};
const raw=Buffer.from(JSON.stringify({catalogs:state.catalogs,meta:{}})).toString('base64url');
console.log(JSON.stringify([await manifestURL(state),'https://btttr.cc/'+raw+'/manifest.json',posterURL(state,'tt0816692'),posterURL({...state,showGenre:false,showRating:false,trendTags:false,qualityTags:false,ageRating:true,lang:'es-MX'},'tt0816692')]));
"""],cwd=root,text=True))
for i,url in enumerate(urls):
 result=subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--max-time','40','--write-out','\n%{http_code}',url])
 body,status=result.rsplit(b'\n',1)
 assert status==b'200'
 if i<2:
  data=json.loads(body)
  assert data['id']=='community.betterposters'
  assert len(data['catalogs'])>=13
  print(('Compressed' if i==0 else 'Legacy')+' manifest: HTTP 200, '+str(len(data['catalogs']))+' catalogs',flush=True)
 else:
  assert body[:3]==b'\xff\xd8\xff' or body[:8]==b'\x89PNG\r\n\x1a\n' or (body[:4]==b'RIFF' and body[8:12]==b'WEBP')
  print('Poster variant '+str(i-1)+': HTTP 200, valid image signature',flush=True)
