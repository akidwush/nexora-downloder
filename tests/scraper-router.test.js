import test from 'node:test';
import assert from 'node:assert/strict';
import {availableProviders,isUsableMedia,scrapeWithFallback,LINK_ONLY_PLATFORMS} from '../lib/scraper-router.js';
import {validateSource,normalizeMedia,classifyMedia} from '../lib/platforms.js';

const fakeMedia={title:'Video',downloads:[{url:'https://cdn.example.com/a.mp4',type:'MP4',quality:'HD'}]};
const success={status:true,result:fakeMedia};
const dummyScrapr={tiktok:{
  tiktokio:async()=>({status:false,message:'unavailable'}),
  tikdownloader:async()=>success,
  snaptik:async()=>success
},resolver:{
  mediafire:async()=>({status:true,result:{url:'https://cdn.example.com/archive.zip',type:'file'}}),
  unshorten:async()=>({status:true,result:{destinationUrl:'https://example.com/article'}})
}};
test('supported Scrapr methods have an explicit, fixed server allowlist',()=>{
  assert.deepEqual(availableProviders('tiktok'),['tiktokio','tikdownloader','snaptik','savetik','ssstik']);
  assert.deepEqual(availableProviders('invalid'),[]);
  assert.ok(LINK_ONLY_PLATFORMS.has('unshorten'));
});
test('host allowlist includes 12 Scrapr-only categories without substring spoofing',()=>{
  assert.equal(validateSource('https://on.soundcloud.com/short').platform,'soundcloud');
  assert.equal(validateSource('https://drive.google.com/file/d/abc/view').platform,'gdrive');
  assert.equal(validateSource('https://www.mediafire.com/file/a/test.zip').platform,'mediafire');
  assert.equal(validateSource('https://bit.ly/example').platform,'unshorten');
  assert.throws(()=>validateSource('https://evilmediafire.com/file'),/Platform/);
  assert.throws(()=>validateSource('https://127.0.0.1/test'),/Platform/);
});
test('Mori Core wins in automatic mode without importing Scrapr',async()=>{
  let loaded=0;
  const media=await scrapeWithFallback({url:'https://tiktok.com/@a/video/1',platform:'tiktok',
    scrapeMori:async()=>fakeMedia,loadScrapr:async()=>{loaded++;return dummyScrapr;}});
  assert.equal(media.engineUsed,'mori');
  assert.equal(loaded,0);
});
test('empty Mori formats trigger bounded Scrapr fallback and normalize CJS result',async()=>{
  const media=await scrapeWithFallback({url:'https://tiktok.com/@a/video/1',platform:'tiktok',
    scrapeMori:async()=>({title:'None',downloads:[]}),
    loadScrapr:async()=>({default:dummyScrapr})});
  assert.equal(media.engineUsed,'scrapr');
  assert.equal(media.providerUsed,'tikdownloader');
  assert.equal(media.downloads[0].quality,'HD');
});
test('manual Scrapr server avoids Mori and selects only requested scraper',async()=>{
  const media=await scrapeWithFallback({url:'https://tiktok.com/@a/video/1',platform:'tiktok',
    engine:'scrapr',provider:'snaptik',
    scrapeMori:()=>{throw Error('Mori must not run')},loadScrapr:async()=>dummyScrapr});
  assert.equal(media.providerUsed,'snaptik');
});
test('reject unknown arbitrary methods or incompatible engine selection',async()=>{
  const args={url:'https://tiktok.com/@a/video/1',platform:'tiktok',scrapeMori:async()=>fakeMedia,
    loadScrapr:async()=>dummyScrapr};
  await assert.rejects(scrapeWithFallback({...args,provider:'constructor'}),/Provider/);
  await assert.rejects(scrapeWithFallback({...args,engine:'mori',provider:'snaptik'}),/Scrapr/);
  await assert.rejects(scrapeWithFallback({...args,engine:'invalid'}),/Engine/);
});
test('resolver-only platforms skip Mori and produce file candidates',async()=>{
  const media=await scrapeWithFallback({
    url:'https://mediafire.com/file/a/x',platform:'mediafire',
    scrapeMori:()=>{throw Error('Mori must not run')},
    loadScrapr:async()=>dummyScrapr
  });
  assert.equal(media.engineUsed,'scrapr');
  assert.equal(normalizeMedia(media,'mediafire').options[0].kind,'file');
});
test('shortlink results are categorized as metadata links, not video',async()=>{
  const media=await scrapeWithFallback({
    url:'https://bit.ly/test',platform:'unshorten',
    loadScrapr:async()=>dummyScrapr
  });
  assert.equal(normalizeMedia(media,'unshorten').options[0].kind,'link');
});
test('playlist items are returned separately and filtered against host spoofing',()=>{
  const result=normalizeMedia({title:'Album',items:[
    {title:'Track A',url:'https://www.youtube.com/watch?v=abc'},
    {title:'Bad',url:'https://youtube.com.evil.org/watch?v=abc'},
    {title:'External',url:'https://other.example/123'}
  ]},'youtube');
  assert.equal(result.options.length,0);
  assert.deepEqual(result.collectionItems.map(item=>item.title),['Track A']);
});
test('media extensions override ambiguous provider labels',()=>{
  assert.equal(classifyMedia('video with audio','', 'https://cdn.example.com/sample.webm'),'video');
  assert.equal(classifyMedia('file','','https://cdn.example.com/pack.zip'),'file');
  assert.equal(classifyMedia('MP3','','https://cdn.example.com/audio.m4a'),'audio');
});
test('failed provider results and empty arrays are not accepted',()=>{
  assert.equal(isUsableMedia({status:false,result:fakeMedia}),false);
  assert.equal(isUsableMedia({title:'Blank',downloads:[]}),false);
  assert.equal(isUsableMedia({title:'List',items:[{url:'https://youtube.com/watch?v=1'}]}),true);
});
test('fallback attempt count is bounded; failed providers return a recoverable error',async()=>{
  const attempts=[];
  const failing={tiktok:{tiktokio:async()=>{attempts.push('one');return {status:false};},
    tikdownloader:async()=>{attempts.push('two');return {status:false};},
    snaptik:async()=>{attempts.push('three');return {status:false};}}};
  await assert.rejects(scrapeWithFallback({
    url:'https://tiktok.com/@a/video/1',platform:'tiktok',
    engine:'scrapr',maxScraprAttempts:2,loadScrapr:async()=>failing
  }),/Semua scraper/);
  assert.deepEqual(attempts,['one','two']);
});
