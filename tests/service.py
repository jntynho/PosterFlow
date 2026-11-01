"""Optional live test of an independently deployed PosterFlow server."""
from pathlib import Path
import json,os,subprocess,sys
base=os.environ.get('POSTERFLOW_API_URL','').rstrip('/')
if not base:
 print('Set POSTERFLOW_API_URL to your deployed PosterFlow HTTPS origin. No live-provider check was run.',file=sys.stderr)
 sys.exit(2)
root=Path(__file__).resolve().parents[1]
urls=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
import {defaults,posterURL,manifestURL} from './src/config.js';
const base=process.argv[1];console.log(JSON.stringify([base+'/api/status',await manifestURL(defaults,base),posterURL(defaults,'tt0816692',base)]));
""",base],cwd=root,text=True))
for i,url in enumerate(urls):
 result=subprocess.check_output(['curl','--fail','--silent','--show-error','--max-time','60','--write-out','\n%{http_code}',url])
 body,status=result.rsplit(b'\n',1);assert status==b'200'
 if i==0:
  data=json.loads(body);assert data['service']=='PosterFlow' and data['ready'] and data['addonId']=='community.posterflow'
 elif i==1:
  data=json.loads(body);assert data['id']=='community.posterflow' and data['catalogs']
 else:assert body[:3]==b'\xff\xd8\xff'
 print(['Own server readiness','Own addon manifest','Own rendered JPEG'][i]+': HTTP 200',flush=True)
