import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import analyze, {withTimeout, extensionForMedia, selectDownloadOptions} from '../api/analyze.js';
import download from '../api/download.js';
import health from '../api/health.js';

function mockRes() {
  return {
    statusCode:200,headers:{},output:null,
    on(){return this}, off(){return this},
    status(code){this.statusCode=code;return this},
    setHeader(key,value){this.headers[key]=value;return this},
    json(body){this.output=body;return this},
    end(body){this.output=JSON.parse(body);return this}
  };
}
test('analyze rejects unsupported verb without Mori import',async()=>{
  const res=mockRes();await analyze({method:'GET'},res);
  assert.equal(res.statusCode,405);
});
test('analyze validates source safely without live scraping',async()=>{
  const res=mockRes();await analyze({method:'POST',body:{url:'https://tiktok.com.evil.com/video/123'},headers:{}},res);
  assert.equal(res.statusCode,400);
  assert.ok(res.output.error);
});
test('media extensions match direct URLs or provider labels',()=>{
  assert.equal(extensionForMedia({kind:'video',type:'HD'},'https://cdn.example.org/file.webm?token=123'),'webm');
  assert.equal(extensionForMedia({kind:'audio',type:'Audio'},'https://cdn.example.org/clip.ogg'),'ogg');
  assert.equal(extensionForMedia({kind:'image',type:'Photo PNG'},'https://cdn.example.org/file'),'png');
  assert.equal(extensionForMedia({kind:'video',type:'MP4'},'https://cdn.example.org/v'),'mp4');
});
test('analyze rejects oversized bodies before provider import',async()=>{
  const res=mockRes();
  await analyze({method:'POST',headers:{'content-length':'5000'},body:{url:'https://vt.tiktok.com/test'}},res);
  assert.equal(res.statusCode,413);
});
test('proxy requires configured secret',async()=>{
  delete process.env.DOWNLOAD_SECRET;
  const res=mockRes();await download({method:'GET',query:{token:'garbage'}},res);
  assert.equal(res.statusCode,400);
});
test('health endpoint shows service state',()=>{
  const res=mockRes();health({method:'GET'},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.output.service,'All Downloader Nexora');
});
test('static web paths and deployment settings exist',()=>{
  const dir=new URL('../',import.meta.url);
  const root=fileURLToPath(dir);
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  assert.match(html,/href="\/styles\.css"/);
  assert.match(html,/src="\/app\.js"/);
  const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
  assert.match(app,/youtube-nocookie\.com/);
  assert.match(app,/selectPlatform\(detected,\{focus:false\}\)/);
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.equal(config.outputDirectory,'public');
  for(const file of ['styles.css','app.js','favicon.svg']) assert.ok(fs.existsSync(path.join(root,'public',file)));
});

test('analysis timeout resolves, rejects and expires correctly',async()=>{
  assert.equal(await withTimeout(Promise.resolve(42),50),42);
  await assert.rejects(withTimeout(Promise.reject(new Error('provider failed')),50),/provider failed/);
  await assert.rejects(withTimeout(new Promise(()=>{}),5),/terlalu lama/);
});
test('footer retains community links on main',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  const css=fs.readFileSync(path.join(root,'public/styles.css'),'utf8');
  assert.match(html,/https:\/\/www\.tiktok\.com\/@dikaorangbaik1/);
  assert.match(html,/https:\/\/whatsapp\.com\/channel\/0029VatAJdFHltYFp77RUU3a/);
  assert.match(html,/class="footer-social-links"/);
  assert.match(css,/\.footer-social-link\{/);
});

test('working download formats outrank twelve failed candidates',()=>{
  const input=[
    ...Array.from({length:12},(_,i)=>({ready:false,type:'Broken '+i})),
    {ready:true,type:'MP4 1080p'},
    {ready:true,type:'MP3'}
  ];
  const result=selectDownloadOptions(input);
  assert.deepEqual(result.slice(0,2).map(item=>item.type),['MP4 1080p','MP3']);
  assert.equal(result.length,12);
  assert.deepEqual(selectDownloadOptions([]),[]);
});

test('code-only limiter has no external database endpoint or API calls',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const limiter=fs.readFileSync(path.join(root,'lib/quota.js'),'utf8');
  assert.doesNotMatch(limiter,/\bfetch\s*\(|rest\/v1|postgres|database\s*function/i);
  assert.equal(fs.existsSync(path.join(root,'api/quota.js')),false);

  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  assert.match(html,/per server/);
  assert.doesNotMatch(html,/id="video-quota"/);
  const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
  assert.doesNotMatch(app,/refreshVideoQuota|\/api\/quota/);
  const downloadSource=fs.readFileSync(path.join(root,'api/download.js'),'utf8');
  assert.match(downloadSource,/videoQuota\(req,false\)/);
  assert.match(downloadSource,/videoQuota\(req,true\)/);
});
