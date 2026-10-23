import test from 'node:test';
import assert from 'node:assert/strict';
import media, {config, validateMediaDestination} from '../netlify/edge-functions/media.mjs';

function signed(payload = {}) {
  return Buffer.from(JSON.stringify({filename:'test-video.mp4',...payload})).toString('base64url') + '.signature';
}
function request(token, mode = 'download', headers = {}) {
  return new Request('https://nexora-demo.netlify.app/api/media?token=' + encodeURIComponent(token) + '&mode=' + mode, {headers});
}
function stubFetch(responses) {
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (target, options) => {
    calls.push({url:String(target),options});
    assert.equal(options.redirect,'manual');
    if (!responses.length) throw new Error('Unexpected request to remote host');
    return responses.shift();
  };
  return {calls,restore:()=>{globalThis.fetch=original;}};
}
const gate=(target='https://cdn.example.com/video.mp4')=>new Response(null,{status:302,headers:{Location:target}});

test('Edge route is same-origin and refuses unsafe media URLs',()=>{
  assert.equal(config.path,'/api/media');
  for(const target of ['http://cdn.example.com/a.mp4','https://127.0.0.1/a.mp4','https://localhost/a.mp4',
    'https://[::1]/a.mp4','https://x.local/a.mp4','https://example.com:444/a.mp4',
    'https://cdn.example.com/master.m3u8']) {
    assert.throws(()=>validateMediaDestination(target),Error,target);
  }
});
test('Edge streams the media with attachment disposition; no 302 to visitor',async()=>{
  const expected=Uint8Array.from([1,2,3,4]);
  const fake=stubFetch([gate(),new Response(expected,{status:200,headers:{'Content-Type':'video/mp4','Content-Length':'4'}})]);
  try {
    const response=await media(request(signed()));
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Location'),null);
    assert.equal(response.headers.get('Content-Disposition'),'attachment; filename="test-video.mp4"');
    assert.equal(response.headers.get('X-Frame-Options'),'SAMEORIGIN');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),expected);
    assert.match(fake.calls[0].url,/^https:\/\/nexora-demo\.netlify\.app\/api\/download\?token=/);
    assert.equal(fake.calls[1].url,'https://cdn.example.com/video.mp4');
  } finally {fake.restore();}
});
test('Preview has inline disposition and passes byte ranges to CDN',async()=>{
  const fake=stubFetch([gate(),new Response(Uint8Array.from([5,6]),{status:206,headers:{
    'Content-Type':'video/mp4','Content-Length':'2','Content-Range':'bytes 2-3/10'
  }})]);
  try {
    const response=await media(request(signed(),'preview',{'Range':'bytes=2-3'}));
    assert.equal(response.status,206);
    assert.match(response.headers.get('Content-Disposition'),/^inline;/);
    assert.equal(response.headers.get('Content-Range'),'bytes 2-3/10');
    assert.equal(fake.calls[1].options.headers.get('Range'),'bytes=2-3');
  } finally {fake.restore();}
});
test('Quota rejection never contacts media origin',async()=>{
  const fake=stubFetch([new Response(JSON.stringify({error:'Kuota habis'}),{status:429})]);
  try {
    assert.equal((await media(request(signed()))).status,429);
    assert.equal(fake.calls.length,1);
  } finally {fake.restore();}
});
test('Disallowed CDN redirects and HTML responses are rejected',async()=>{
  const fake=stubFetch([gate(),new Response(null,{status:302,headers:{Location:'http://bad.example.com/file'}})]);
  try {
    assert.equal((await media(request(signed()))).status,502);
    assert.equal(fake.calls.length,2);
  } finally {fake.restore();}
  const fake2=stubFetch([gate(),new Response('<html>wrong</html>',{headers:{'Content-Type':'text/html'}})]);
  try {
    assert.equal((await media(request(signed()))).status,502);
  } finally {fake2.restore();}
});
