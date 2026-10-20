import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import health,{config as healthConfig} from '../netlify/functions/health.mjs';
import analyze,{config as analyzeConfig} from '../netlify/functions/analyze.mjs';
import download,{config as downloadConfig} from '../netlify/functions/download.mjs';
import {makeDownloadToken,verifyDownloadToken} from '../lib/token.js';

function request(path, options) {
  return new Request('https://nexora-demo.netlify.app'+path,options);
}
test('Netlify configuration uses static HTML and three native function routes',()=>{
  const config=fs.readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
  assert.match(config,/publish\s*=\s*"public"/);
  assert.match(config,/directory\s*=\s*"netlify\/functions"/);
  assert.match(config,/external_node_modules\s*=\s*\["\@coflyn\/mori"\]/);
  assert.equal(healthConfig.path,'/api/health');
  assert.equal(analyzeConfig.path,'/api/analyze');
  assert.equal(downloadConfig.path,'/api/download');
  assert.equal(analyzeConfig.rateLimit.aggregateBy,'ip');
});

test('Netlify health and analyze return web-standard JSON responses',async()=>{
  const status=health(request('/api/health'));
  assert.equal(status.status,200);
  assert.equal((await status.json()).hosting,'Netlify');
  assert.equal((await analyze(request('/api/analyze'))).status,405);
  assert.equal((await analyze(request('/api/analyze',{method:'POST',body:'bad json'}))).status,400);
  assert.equal((await analyze(request('/api/analyze',{method:'POST',body:JSON.stringify({url:'a'.repeat(4300)})}))).status,413);
  const blocked=await analyze(request('/api/analyze',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({url:'https://tiktok.com.evil.example/abc'})
  }));
  assert.equal(blocked.status,400);
  assert.match((await blocked.json()).error,/Platform|platform/);
});

test('Netlify direct redirect is token-protected, per-instance limited, and sends zero media bytes',async()=>{
  const old=process.env.DOWNLOAD_SECRET;
  try {
    process.env.DOWNLOAD_SECRET='abcdefghijklmnopqrstuvwxyz0123456789TOKEN';
    const video=makeDownloadToken({
      url:'https://cdn.example.org/reel.mp4?token=provider',filename:'reel.mp4',kind:'video'
    });
    assert.equal(verifyDownloadToken(video).kind,'video');
    const url='/api/download?token='+encodeURIComponent(video);
    const visitor={ip:'203.0.113.77'};
    assert.equal((await download(request('/api/download',{method:'POST'}),visitor)).status,405);
    assert.equal((await download(request('/api/download?token=garbage'),visitor)).status,400);
    assert.equal((await download(request(url),{})).status,503);
    for(let n=0;n<4;n++){
      const result=await download(request(url),visitor);
      assert.equal(result.status,302);
      assert.equal(result.headers.get('location'),'https://cdn.example.org/reel.mp4?token=provider');
      assert.equal(result.headers.get('X-RateLimit-Remaining'),String(3-n));
      assert.equal(await result.text(),'');
    }
    const blocked=await download(request(url),visitor);
    assert.equal(blocked.status,429);
    assert.equal(blocked.headers.get('X-RateLimit-Remaining'),'0');
    const image=makeDownloadToken({url:'https://cdn.example.org/photo.jpg',kind:'image'});
    assert.equal((await download(request('/api/download?token='+encodeURIComponent(image)),visitor)).status,302);
    const audio=makeDownloadToken({url:'https://cdn.example.org/song.mp3',kind:'audio'});
    assert.equal((await download(request('/api/download?token='+encodeURIComponent(audio)),visitor)).status,302);
    const other=await download(request(url),{ip:'203.0.113.78'});
    assert.equal(other.status,302);
    const manifest=makeDownloadToken({url:'https://cdn.example.org/master.m3u8',kind:'video'});
    assert.equal((await download(request('/api/download?token='+encodeURIComponent(manifest)),{ip:'203.0.113.79'})).status,422);
  } finally {
    if(old===undefined) delete process.env.DOWNLOAD_SECRET;
    else process.env.DOWNLOAD_SECRET=old;
  }
});
