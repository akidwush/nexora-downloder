/**
 * Headless Chrome/Android viewport regression: downloading audio and video must
 * never navigate the top-level Nexora document. External media is mocked; the
 * browser still performs real attachment downloads to the runner's temp dir.
 */
import assert from 'node:assert/strict';
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const chrome = process.env.CHROME_PATH;
if (!chrome) throw new Error('CHROME_PATH is required for browser regression');
const folder = await mkdtemp(path.join(tmpdir(), 'nexora-downloads-'));
const browser = await puppeteer.launch({
  executablePath:chrome, headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
});
const audioName = 'SpotiDown.App - Stand by Me - Oasis.mp3';
const videoName = 'Nexora sample video.mp4';
const audioBytes = Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00NEXORA');
const videoBytes = Buffer.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,0,0,0,0]);
try {
  const page = await browser.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36');
  const session = await page.createCDPSession();
  await session.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:folder});
  const errors=[];
  const navigations=[];
  page.on('pageerror', error=>errors.push(error.message));
  page.on('framenavigated', frame=>{
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await page.setRequestInterception(true);
  const served=[];
  page.on('request', request=>{
    const pathname=new URL(request.url()).pathname;
    if(pathname==='/api/analyze') {
      void request.respond({
        status:200,
        contentType:'application/json',
        headers:{'Cache-Control':'no-store'},
        body:JSON.stringify({
          ok:true, platform:'spotify', title:'Stand by Me - Oasis',
          engineUsed:'scrapr',providerUsed:'spotidown',deliveryMode:'edge-proxy',
          options:[
            {kind:'audio',type:'MP3',quality:'High',ready:true,downloadUrl:'/api/media?token=audio-test'},
            {kind:'video',type:'MP4',quality:'720p',ready:true,downloadUrl:'/api/media?token=video-test'}
          ]
        })
      });
    } else if(pathname==='/api/media') {
      const isAudio=request.url().includes('audio-test');
      const bytes=isAudio?audioBytes:videoBytes;
      served.push(isAudio?'audio':'video');
      void request.respond({
        status:200,
        headers:{
          'Content-Type':isAudio?'audio/mpeg':'video/mp4',
          'Content-Length':String(bytes.length),
          'Content-Disposition':'attachment; filename="'+(isAudio?audioName:videoName)+'"',
          'X-Frame-Options':'SAMEORIGIN',
          'Cache-Control':'private, no-store'
        },
        body:bytes
      });
    } else {
      void request.continue();
    }
  });
  await page.goto('http://127.0.0.1:8765/#download',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#analyze-btn');
  const originalPageUrl=page.url();
  const initialMainFrameNavigations=navigations.length;
  await page.type('#url-input','https://open.spotify.com/track/nexora-test');
  await page.click('#analyze-btn');
  await page.waitForSelector('.result-ready .result-option');
  const choices=await page.$$('.result-option a.download-choice');
  assert.equal(choices.length,2,'Two download actions should be visible');
  const saveFile=async name=>{
    for(let i=0;i<40;i++) {
      const files=await readdir(folder);
      if(files.includes(name)) return;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw new Error('Expected browser download missing: '+name+'; files='+(await readdir(folder)).join(','));
  };
  // MP3: JavaScript fetch -> bounded Blob -> browser save dialog/download.
  await choices[0].click();
  await saveFile(audioName);
  assert.deepEqual(await readFile(path.join(folder,audioName)),audioBytes);
  assert.equal(page.url(),originalPageUrl,'MP3 must not leave Nexora');
  assert.equal(navigations.length,initialMainFrameNavigations,'MP3 must not navigate the top frame');

  // Video: a hidden, same-origin iframe performs browser-native streaming.
  await choices[1].click();
  await saveFile(videoName);
  assert.deepEqual(await readFile(path.join(folder,videoName)),videoBytes);
  assert.equal(page.url(),originalPageUrl,'Video must not leave Nexora');
  assert.equal(navigations.length,initialMainFrameNavigations,'Video must not navigate the top frame');
  assert.deepEqual(errors,[],'No client-side errors during downloads');
  assert.deepEqual(served,['audio','video']);
  console.log(JSON.stringify({ok:true,viewport:'390px mobile',audio:audioName,video:videoName,
    topNavigationCount:navigations.length-initialMainFrameNavigations,
    requestCount:served.length}));
} finally {
  await browser.close();
  await rm(folder,{recursive:true,force:true});
}
