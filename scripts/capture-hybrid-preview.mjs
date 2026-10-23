// Render the real branch frontend with Chromium. Screenshot only the actual
// form card, with the optional advanced controls expanded by user interaction.
import puppeteer from 'puppeteer-core';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath=process.env.CHROME_PATH;
if(!executablePath)throw new Error('CHROME_PATH must point to installed Chrome/Chromium');
await mkdir('docs/screenshots',{recursive:true});
const browser=await puppeteer.launch({
  executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
});
try {
  for(const item of [
    {label:'mobile',width:390,height:850},
    {label:'desktop',width:1366,height:900}
  ]) {
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error.message)));
    await page.setViewport({width:item.width,height:item.height,deviceScaleFactor:1});
    await page.goto('http://127.0.0.1:8765/#download',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.scraper-settings');
    await page.click('.scraper-settings summary');
    await page.type('#url-input','https://www.tiktok.com/@example/video/1234567890123456789');
    await page.select('#scraper-engine','scrapr');
    await page.select('#scraper-provider','snaptik');
    const settings=await page.evaluate(()=>({
      engine:document.querySelector('#scraper-engine')?.value,
      provider:document.querySelector('#scraper-provider')?.value,
      options:[...document.querySelector('#scraper-provider').options].length,
      viewportWidth:document.documentElement.clientWidth,
      cardWidth:document.querySelector('.downloader-card').getBoundingClientRect().width
    }));
    assert.equal(settings.engine,'scrapr');
    assert.equal(settings.provider,'snaptik');
    assert.ok(settings.options>=5);
    assert.ok(settings.cardWidth<=settings.viewportWidth,'Downloader card exceeds viewport');
    assert.deepEqual(errors,[],'No JavaScript page errors');
    const element=await page.$('.downloader-card');
    await element.screenshot({path:`docs/screenshots/hybrid-${item.label}.png`});
    console.log('BROWSER_AUDIT '+JSON.stringify({view:item.label,...settings,errors}));

    // Exercise the end-to-end client render without consuming third-party
    // bandwidth. Only the browser API response is mocked; UI is real.
    await page.evaluate(()=>{
      const originalFetch=window.fetch.bind(window);
      window.fetch=(input,options={})=>{
        if(new URL(input,location.href).pathname!=='/api/analyze')return originalFetch(input,options);
        window.__testAnalyzeRequest=JSON.parse(options.body);
        return Promise.resolve(new Response(JSON.stringify({
          ok:true,platform:'tiktok',title:'Contoh hasil audit',author:'NEXORA test',
          engineUsed:'scrapr',providerUsed:'snaptik',deliveryMode:'edge-proxy',
          options:[
            {kind:'video',type:'MP4',quality:'720p',ready:true,downloadUrl:'/api/media?token=video-demo'},
            {kind:'audio',type:'MP3',quality:'128kbps',ready:true,downloadUrl:'/api/media?token=audio-demo'},
            {kind:'file',type:'PDF',quality:'Original',ready:true,downloadUrl:'/api/media?token=file-demo'},
            {kind:'link',type:'Resolved link',quality:'Destination',ready:true,
             targetUrl:'https://example.com/authorised',targetHost:'example.com'}
          ],
          collectionItems:[{title:'Item playlist',url:'https://www.tiktok.com/@example/video/1234567890123456789'}]
        }),{status:200,headers:{'Content-Type':'application/json'}}));
      };
    });
    await page.click('#analyze-btn');
    await page.waitForSelector('.result-ready');
    const rendered=await page.evaluate(()=>({
      payload:window.__testAnalyzeRequest,
      entries:document.querySelectorAll('.result-option').length,
      preview:document.querySelectorAll('.preview-choice').length,
      downloads:document.querySelectorAll('a[href^="/api/media?token="]').length,
      collections:document.querySelectorAll('.collection-item').length,
      copyLink:[...document.querySelectorAll('button')].some(el=>el.textContent.includes('Salin link tujuan')),
      cardRight:document.querySelector('.downloader-card').getBoundingClientRect().right
    }));
    assert.equal(rendered.payload?.engine,'scrapr');
    assert.equal(rendered.payload?.provider,'snaptik');
    assert.equal(rendered.entries,4);
    assert.equal(rendered.preview,1);
    assert.equal(rendered.downloads,3);
    assert.equal(rendered.collections,1);
    assert.equal(rendered.copyLink,true);
    assert.ok(rendered.cardRight<=item.width+1,'Result panel extends beyond viewport');
    assert.deepEqual(errors,[],'No JavaScript errors after rendering mixed media');
    console.log('RESULT_RENDER_AUDIT '+JSON.stringify({view:item.label,entries:rendered.entries,
      preview:rendered.preview,downloads:rendered.downloads,collections:rendered.collections,errors}));
    await page.close();
  }
} finally {await browser.close()}
