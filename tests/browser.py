"""Deterministic browser regressions. Run with a dev server on port 5173."""
from playwright.sync_api import sync_playwright, expect
import os, json

POSTER='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#34304a"/></svg>'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'],proxy={'server':os.environ.get('HTTPS_PROXY','http://proxy:8080'),'bypass':'localhost,127.0.0.1'})
 context=b.new_context(viewport={'width':1440,'height':1050})
 page=context.new_page(); errors=[]; requests=[]; network={'image':True,'manifest':True}
 page.on('pageerror',lambda e:errors.append(str(e)))
 def route_external(route):
  url=route.request.url
  if '/imdb/' in url:
   requests.append(url)
   if network['image']:route.fulfill(status=200,content_type='image/svg+xml',body=POSTER)
   else:route.abort()
  elif '/manifest.json' in url:
   if network['manifest']:route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps({'id':'community.betterposters','catalogs':[{'id':'test'}]}))
   else:route.abort()
  else:route.abort()
 page.route('https://btttr.cc/**',route_external)
 page.goto(os.environ.get('POSTERFLOW_TEST_URL','http://127.0.0.1:5173'))
 expect(page.locator('#preview-status')).to_have_text('Live preview')
 assert page.locator('html').get_attribute('lang')=='en'
 assert page.locator('html').get_attribute('dir')=='ltr'
 assert page.locator('.brand-symbol svg rect').get_attribute('x')=='4'
 assert page.evaluate('getComputedStyle(document.documentElement).colorScheme')=='dark'
 assert len(requests)==1, requests
 page.locator('#next').click()
 assert page.locator('#catalog-grid input:checked').count()==3
 assert len(requests)==1, 'Navigation must not reload the preview'
 # Bulk state, filtering and keyboard focus must remain consistent.
 page.locator('#select-all').click();expect(page.locator('#select-all')).to_have_text('Clear all')
 assert page.locator('#catalog-grid input:checked').count()==13
 page.get_by_role('checkbox',name='Upcoming anime',exact=True).focus()
 page.get_by_role('checkbox',name='Upcoming anime',exact=True).uncheck()
 expect(page.locator('#select-all')).to_have_text('Select all')
 assert page.get_by_role('checkbox',name='Upcoming anime',exact=True).evaluate('(e)=>e===document.activeElement')
 page.locator('#search').fill('  anime  ');assert page.locator('#catalog-grid .catalog').count()==2
 page.locator('#select-all').click();expect(page.locator('#search')).to_have_value('  anime  ')
 expect(page.locator('#select-all')).to_have_text('Clear all')
 page.locator('#select-all').click();assert page.locator('#catalog-grid input:checked').count()==0
 page.locator('[data-step="3"]').click();expect(page.locator('#toast')).to_contain_text('Choose at least one catalog')
 page.locator('#search').fill('top rated');page.get_by_role('checkbox',name='Top rated',exact=True).check()
 page.locator('#next').click()
 page.locator('[data-option="showRating"]').uncheck();expect(page.locator('[data-select="ratingSource"]')).to_be_disabled()
 page.locator('[data-option="showRating"]').check()
 page.locator('[data-option="ageRating"]').check()
 page.wait_for_function("document.querySelector('#poster-img').src.includes('a/imdb')")
 expect(page.locator('#preview-status')).to_have_text('Live preview')
 # Several fast adjustments should coalesce into a single image request.
 before=len(requests)
 for key in ['trendTags','qualityTags','showGenre']:page.locator(f'[data-option="{key}"]').uncheck()
 page.wait_for_timeout(300);expect(page.locator('#preview-status')).to_have_text('Live preview')
 assert len(requests)==before+1
 page.locator('[data-select="lang"]').select_option('es-MX')
 page.locator('#next').click();page.locator('#generate').click()
 expect(page.locator('#instructions')).to_contain_text('Verified with BetterPosters')
 addon=page.locator('#output').input_value();assert addon.endswith('/manifest.json')
 assert page.locator('#install').get_attribute('href').startswith('stremio://')
 page.locator('[data-step="2"]').click();page.locator('#next').click()
 expect(page.locator('#output')).to_have_value(addon)
 # Changed settings must invalidate any previously generated link.
 page.locator('[data-step="2"]').click();page.locator('[data-option="showGenre"]').check();page.locator('#next').click()
 expect(page.locator('#result')).to_be_hidden()
 network['manifest']=False;page.locator('#generate').click()
 expect(page.locator('#instructions')).to_contain_text('could not be verified')
 assert page.locator('#output').input_value().endswith('/manifest.json')
 # Clipboard failure gets an actionable fallback.
 page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined})")
 page.locator('#copy').click();expect(page.locator('#toast')).to_contain_text('copy it manually')
 # External preview failure and recovery.
 network['image']=False;page.locator('#refresh').click()
 expect(page.locator('#preview-status')).to_have_text('Unavailable')
 expect(page.locator('.image-fallback')).to_be_visible()
 network['image']=True;page.locator('#retry').click()
 expect(page.locator('#preview-status')).to_have_text('Live preview')
 expect(page.locator('.image-fallback')).to_be_hidden()
 # Poster-only workflow has three steps and no catalog installation action.
 page.reload();expect(page.locator('#preview-status')).to_have_text('Live preview')
 assert json.loads(page.evaluate('localStorage.getItem("posterflow-v1")'))['lang']=='es-MX'
 page.locator('[data-mode="poster"]').click();assert page.locator('.nav-step:visible').count()==3
 page.locator('#next').click();expect(page.locator('.step-caption')).to_have_text('STEP 2 OF 3')
 page.locator('#next').click();page.locator('#generate').click()
 expect(page.locator('#output')).to_be_visible();assert '{imdb_id}' in page.locator('#output').input_value()
 expect(page.locator('#install')).to_be_hidden()
 # The preview precedes controls visually and in keyboard/reading order at all sizes.
 for width in [320,390,768,1440]:
  page.set_viewport_size({'width':width,'height':900});page.locator('[data-step="0"]').click()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
  preview=page.locator('.preview').bounding_box();panel=page.locator('.panel').bounding_box()
  assert preview['y']+preview['height']<=panel['y'],width
 # A late verification must not overwrite a newer configuration or unlock its button.
 page.locator('[data-mode="catalog"]').click();page.locator('[data-step="3"]').click()
 page.evaluate("()=>{window.originalFetch=fetch;window.pending=[];window.fetch=(...args)=>new Promise(resolve=>window.pending.push(resolve));}")
 page.locator('#generate').click();page.wait_for_function('window.pending.length===1')
 page.locator('[data-step="2"]').click();page.locator('[data-option="ageRating"]').uncheck()
 page.locator('#next').click();page.locator('#generate').click();page.wait_for_function('window.pending.length===2')
 page.evaluate("window.pending[0](new Response(JSON.stringify({id:'community.betterposters',catalogs:[{}]}),{status:200}))")
 expect(page.locator('#instructions')).to_contain_text('Checking the BetterPosters')
 expect(page.locator('#generate')).to_be_disabled()
 page.evaluate("()=>{window.pending[1](new Response(JSON.stringify({id:'community.betterposters',catalogs:[{}]}),{status:200}));window.fetch=window.originalFetch;}")
 expect(page.locator('#instructions')).to_contain_text('Verified with BetterPosters')
 expect(page.locator('#generate')).to_be_enabled()
 # A hung manifest request has a bounded timeout and leaves an actionable result.
 page.evaluate("()=>{window.fetch=(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));}")
 page.clock.install()
 page.locator('#generate').click();expect(page.locator('#instructions')).to_contain_text('Checking the BetterPosters')
 page.clock.fast_forward(12001)
 expect(page.locator('#instructions')).to_contain_text('could not be verified')
 expect(page.locator('#generate')).to_be_enabled()
 page.evaluate("()=>{window.fetch=window.originalFetch;}");page.clock.resume()
 # Malformed stored data cannot inject markup or duplicate public lists.
 page.evaluate("localStorage.setItem('posterflow-v1', JSON.stringify({catalogs:['top','top','bad'],lang:'<script>',qualityTags:'false'}))")
 page.reload();page.locator('#next').click();assert page.locator('#catalog-grid input:checked').count()==1
 # Blocked storage is explicit and preferences continue to work for the session.
 page.evaluate("Object.defineProperty(Storage.prototype,'setItem',{value(){throw new Error('blocked')}})")
 page.locator('#select-all').click();expect(page.locator('#toast')).to_contain_text('could not be saved')
 assert page.locator('#catalog-grid input:checked').count()==13
 assert not errors,errors
 print('PASS: dark theme, unchanged brand icon, preview above controls at 4 widths, both workflows, bulk selection/focus/search, debouncing/cache, disabled rating source, link persistence/invalidation, external verification/failure, image recovery, clipboard fallback, malformed/blocked storage; no JS errors.')
 favicon=page.locator('link[rel="icon"]').get_attribute('href')
 from urllib.parse import urljoin
 assert page.request.get(urljoin(page.url,favicon)).status==200
 context.close();b.close()
