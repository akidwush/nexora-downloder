import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { verifyDownloadToken } from '../lib/token.js';
import { assertPublicDns } from '../lib/safety.js';

export const config = { maxDuration: 60 };
const MAX_BYTES = 120 * 1024 * 1024;
const ALLOWED_REFERER_HOSTS = ['tiktok.com','instagram.com','youtube.com','facebook.com','x.com','twitter.com','reddit.com','bilibili.com','pinterest.com','spotify.com','bandcamp.com'];
function filterHeaders(headers) {
  const out = {'User-Agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36','Accept':'*/*'};
  for (const name of ['Referer','Origin']) {
    const val = headers?.[name];
    if (typeof val !== 'string') continue;
    try {
      const url = new URL(val);
      if (url.protocol==='https:' && ALLOWED_REFERER_HOSTS.some(x=>url.hostname===x || url.hostname.endsWith('.'+x))) out[name] = url.origin + '/';
    } catch {}
  }
  return out;
}
function fail(res,status,message) {
  if (!res.headersSent) {res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:message}));}
  else res.destroy();
}
export default async function handler(req,res) {
  if (req.method !== 'GET') return fail(res,405,'Metode tidak didukung.');
  try {
    const payload = verifyDownloadToken(req.query?.token);
    let target = payload.url;
    let upstream;
    const ctl = new AbortController();
    const tm = setTimeout(()=>ctl.abort(),55000);
    res.on('close',()=> {if (!res.writableEnded) ctl.abort();});
    try {
      for (let n=0;n<4;n++) {
        await assertPublicDns(target);
        upstream = await fetch(target,{redirect:'manual',headers:filterHeaders(payload.headers),signal:ctl.signal});
        if ([301,302,303,307,308].includes(upstream.status)) {
          if (n===3) throw new Error('Terlalu banyak redirect.');
          const location=upstream.headers.get('location');
          if (!location) throw new Error('Redirect tanpa tujuan.');
          target=new URL(location,target).toString();
          upstream.body?.cancel().catch(()=>{});
          continue;
        }
        break;
      }
      if (!upstream?.ok || !upstream.body) return fail(res,502,'Server media menolak unduhan langsung.');
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      if (/text\/html|application\/json|text\/plain/i.test(contentType)) return fail(res,502,'Provider tidak mengembalikan file media.');
      const length = Number(upstream.headers.get('content-length') || '0');
      if (length > MAX_BYTES) return fail(res,413,'File terlalu besar untuk proxy Vercel (maksimum 120 MB). Gunakan tautan langsung.');
      const filename = String(payload.filename||'nexora-media.mp4').replace(/["\\\r\n]/g,'_').slice(0,140);
      res.statusCode=200;
      res.setHeader('Content-Type',contentType);
      res.setHeader('Content-Disposition',`attachment; filename="${filename.replace(/[^\x20-\x7e]/g,'_')}"`);
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      if (length) res.setHeader('Content-Length',String(length));
      let bytes=0;
      const guard = new Transform({transform(chunk,_encoding,done) {
        bytes+=chunk.length;
        if (bytes>MAX_BYTES) done(new Error('Media melebihi batas 120 MB.'));
        else done(null,chunk);
      }});
      await pipeline(Readable.fromWeb(upstream.body),guard,res);
    } finally {clearTimeout(tm);}
  } catch (err) {
    console.error('[nexora/download]',err.message);
    return fail(res, /token|kedaluwarsa|dikonfigurasi|tidak valid/i.test(err.message)?400:502,err.message.includes('fetch')?'Gagal menghubungi server media.':err.message);
  }
}
