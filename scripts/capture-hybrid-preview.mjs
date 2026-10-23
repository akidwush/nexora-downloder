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
    await page.close();
  }
} finally {await browser.close()}
