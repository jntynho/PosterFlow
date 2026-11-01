from playwright.sync_api import sync_playwright
import os,json
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'],proxy={'server':os.environ.get('HTTPS_PROXY','http://proxy:8080'),'bypass':'localhost,127.0.0.1'})
 page=b.new_page(viewport={'width':1440,'height':1050})
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5173');page.wait_for_timeout(2500)
 page.screenshot(path='/tmp/posterflow-desktop.png',full_page=True)
 page.get_by_role('button',name='متابعة ←').click()
 assert page.locator('#catalog-grid input:checked').count()==3
 page.locator('#search').fill('الأنمي');assert page.locator('#catalog-grid .catalog').count()==1
 page.locator('#search').fill('');page.get_by_role('button',name='متابعة ←').click()
 page.locator('[data-option="ageRating"]').check()
 assert 'a/imdb' in page.locator('#poster-img').get_attribute('src')
 page.get_by_role('button',name='متابعة ←').click();page.locator('#generate').click()
 page.locator('#output').wait_for();url=page.locator('#output').input_value();assert url.endswith('/manifest.json')
 assert page.locator('#install').get_attribute('href').startswith('stremio://')
 page.reload();assert json.loads(page.evaluate('localStorage.getItem("posterflow-v1")'))['ageRating']
 page.locator('[data-mode="poster"]').click();page.locator('#next').click()
 assert page.locator('[data-option="qualityTags"]').is_visible()
 page.locator('#next').click();page.locator('#generate').click();page.locator('#output').wait_for()
 assert '{imdb_id}' in page.locator('#output').input_value();assert not page.locator('#install').is_visible()
 for width in [390,768,1440]:
  page.set_viewport_size({'width':width,'height':900});page.locator('[data-step="0"]').click()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
  page.screenshot(path=f'/tmp/posterflow-{width}.png',full_page=True)
 print('PASS: catalogs, search, toggles, manifest, Stremio link, persistence, poster-only flow, 3 responsive widths; JS errors:',errors)
 assert not errors
 b.close()
