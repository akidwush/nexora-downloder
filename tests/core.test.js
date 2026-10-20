import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSource,classifyMedia,normalizeMedia,safeMediaHeaders} from '../lib/platforms.js';
import {assertRemoteUrl,assertPublicAddresses,filenameFromMeta,isStreamManifest,mediaResponseProblem} from '../lib/safety.js';
import {makeDownloadToken,verifyDownloadToken,hasDownloadProxy} from '../lib/token.js';

test('platform validation exact domains, allowed subdomain',()=>{
  assert.equal(validateSource('https://vt.tiktok.com/ZSq1/').platform,'tiktok');
  assert.equal(validateSource('https://www.instagram.com/reel/123/').platform,'instagram');
  assert.equal(validateSource('https://youtu.be/ABC123').platform,'youtube');
  assert.equal(validateSource('https://my.bandcamp.com/track/foo').platform,'bandcamp');
});
test('reject malicious URL host, scheme and credential',()=>{
  for(const url of ['https://tiktok.com.evil.example/watch','http://tiktok.com/watch','https://fake-tiktok.com/test','https://127.0.0.1/example','https://a:b@tiktok.com/v','https://tiktok.com:8443/a']) {
    assert.throws(()=>validateSource(url),url);
  }
});
test('skip empty media placeholders before limiting options',()=>{
  const downloads = Array.from({length:25},()=>({type:'MP4'}));
  downloads.push({type:'WebM',quality:'720p',url:'https://cdn.example.org/video.webm'});
  const result = normalizeMedia({downloads},'youtube');
  assert.equal(result.options.length,1);
  assert.equal(result.options[0].index,25);
});

test('classify media',()=>{
  assert.equal(classifyMedia('MP3','320kbps'),'audio');
  assert.equal(classifyMedia('Photo HD',''),'image');
  assert.equal(classifyMedia('No watermark','1080p'),'video');
  assert.equal(classifyMedia('Media','','https://cdn.example.org/song.ogg?source=1'),'audio');
  assert.equal(classifyMedia('Media','','https://cdn.example.org/cover.avif#preview'),'image');
});
test('normalize metadata and cap variants',()=>{
  const media={title:'foo',downloads:[{type:'MP4',quality:'HD',url:'https://cdn.example.org/foo.mp4'}]};
  const result=normalizeMedia(media,'tiktok');
  assert.equal(result.options.length,1);
  assert.equal(result.options[0].kind,'video');
});
test('prevent unsafe direct addresses and header secrets',()=>{
  assert.throws(()=>assertRemoteUrl('https://localhost/abc'));
  assert.throws(()=>assertRemoteUrl('https://127.0.0.1/test'));
  assert.deepEqual(safeMediaHeaders({Cookie:'secret',Referer:'https://youtube.com/watch?v=abc'}),{Referer:'https://youtube.com/'});
  assert.match(filenameFromMeta('hello/world','mp4'),/\.mp4$/);
});
test('signed token accepts valid, rejects tampered',()=>{
  process.env.DOWNLOAD_SECRET='0123456789abcdef0123456789abcdef';
  assert.equal(hasDownloadProxy(),true);
  const token=makeDownloadToken({url:'https://cdn.example.org/test.mp4',filename:'test.mp4',headers:{}});
  assert.equal(verifyDownloadToken(token).filename,'test.mp4');
  assert.throws(()=>verifyDownloadToken(token+'wrong'));
  delete process.env.DOWNLOAD_SECRET;
});

test('reject private, reserved, and mixed DNS answers before the proxy connects',()=>{
  for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','172.20.0.1','192.168.1.1','192.0.0.0','192.0.0.8','192.0.0.255','192.0.2.5','192.88.99.1','198.18.0.1','203.0.113.9']) {
    assert.throws(()=>assertPublicAddresses([{address,family:4}]),address);
  }
  for(const address of ['::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1','2002::1','2001::1']) {
    assert.throws(()=>assertPublicAddresses([{address,family:6}]),address);
  }
  assert.doesNotThrow(()=>assertPublicAddresses([{address:'8.8.8.8',family:4}]));
  assert.doesNotThrow(()=>assertPublicAddresses([{address:'2606:4700:4700::1111',family:6}]));
  assert.throws(()=>assertPublicAddresses([{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]));
  assert.throws(()=>assertPublicAddresses([]));
});

test('label mentioning music or sound does not turn a video into audio',()=>{
  assert.equal(classifyMedia('MP4 no sound','720p'),'video');
  assert.equal(classifyMedia('Music Video','HD'),'video');
  assert.equal(classifyMedia('Audio Only','128kbps'),'audio');
  assert.equal(classifyMedia('Sound','128kbps'),'audio');
  assert.equal(classifyMedia('MP3','320kbps','https://cdn.example.org/video.mp4'),'video');
  assert.equal(classifyMedia('Video','720p','https://cdn.example.org/audio.m4a'),'audio');
});

test('reject padded, compact and documentation IPv6 aliases',()=>{
  for(const address of ['2001:0db8::1','2001:0000::1','2001:0010::1','2001:002a::1','3fff::1','3ff0::1']) {
    assert.throws(()=>assertPublicAddresses([{address,family:6}]),address);
  }
  assert.doesNotThrow(()=>assertPublicAddresses([{address:'2001:4860:4860::8888',family:6}]));
});

test('reject HLS/DASH playlists and incomplete upstream responses',()=>{
  assert.equal(isStreamManifest('https://cdn.example.com/list.m3u8?token=1'),true);
  assert.equal(isStreamManifest('https://cdn.example.com/list%2empd'),true);
  assert.equal(isStreamManifest('https://cdn.example.com/file','application/vnd.apple.mpegurl'),true);
  assert.notEqual(mediaResponseProblem(206,'video/mp4','https://cdn.example.com/video.mp4'),null);
  assert.notEqual(mediaResponseProblem(204,'video/mp4','https://cdn.example.com/video.mp4'),null);
  assert.notEqual(mediaResponseProblem(200,'application/dash+xml','https://cdn.example.com/media'),null);
  assert.notEqual(mediaResponseProblem(200,'application/problem+json','https://cdn.example.com/media'),null);
  assert.equal(mediaResponseProblem(200,'video/mp4','https://cdn.example.com/video.mp4'),null);
  assert.equal(mediaResponseProblem(200,'application/octet-stream','https://cdn.example.com/video.mp4'),null);
});
