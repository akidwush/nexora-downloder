import https from 'node:https';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { verifyDownloadToken } from '../lib/token.js';
import { assertRemoteUrl, resolvePublicAddresses, mediaResponseProblem } from '../lib/safety.js';

export const config = { maxDuration: 60 };
const MAX_BYTES = 120 * 1024 * 1024;
const ALLOWED_REFERER_HOSTS = ['tiktok.com','instagram.com','youtube.com','facebook.com','x.com','twitter.com','reddit.com','bilibili.com','pinterest.com','spotify.com','bandcamp.com'];
function filterHeaders(headers) {
  const out = {'User-Agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36','Accept':'*/*','Accept-Encoding':'identity'};
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

/** Pin verified DNS answers to the same TLS request to prevent DNS rebinding. */
async function openUpstream(url, headers, signal) {
  const target = assertRemoteUrl(url);
  const addresses = await resolvePublicAddresses(target.hostname);
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.request(target, {
      method: 'GET',
      headers,
      signal,
      timeout: 20000,
      lookup(hostname, options, callback) {
        if (hostname !== target.hostname) {
          callback(new Error('Hostname berubah selama koneksi.'));
          return;
        }
        // HTTPS preserves the original Host header and TLS SNI.
        if (options?.all) callback(null, [chosen]);
        else callback(null, chosen.address, chosen.family);
      }
    }, resolve);
    request.on('timeout', () => request.destroy(new Error('Koneksi ke server media terlalu lama.')));
    request.on('error', reject);
    request.end();
  });
}
export default async function handler(req,res) {
  if (req.method !== 'GET') return fail(res,405,'Metode tidak didukung.');
  const ctl = new AbortController();
  const tm = setTimeout(()=>ctl.abort(),55000);
  const closeHandler = () => {if (!res.writableEnded) ctl.abort();};
  res.on('close', closeHandler);
  try {
    const payload = verifyDownloadToken(req.query?.token);
    let target = payload.url;
    let upstream;
    for (let n=0;n<4;n++) {
      upstream = await openUpstream(target, filterHeaders(payload.headers), ctl.signal);
      if ([301,302,303,307,308].includes(upstream.statusCode)) {
        if (n===3) {upstream.destroy();throw new Error('Terlalu banyak redirect.');}
        const location=upstream.headers.location;
        upstream.destroy();
        if (!location) throw new Error('Redirect tanpa tujuan.');
        target=new URL(location,target).toString();
        continue;
      }
      break;
    }
    const contentType = String(upstream.headers['content-type'] || 'application/octet-stream');
    const responseProblem = mediaResponseProblem(upstream.statusCode, contentType, target);
    if (responseProblem) {
      upstream.destroy();
      return fail(res,502,responseProblem);
    }
    const length = Number(upstream.headers['content-length'] || '0');
    if (Number.isFinite(length) && length > MAX_BYTES) {
      upstream.destroy();
      return fail(res,413,'File terlalu besar untuk proxy Vercel (maksimum 120 MB). Gunakan tautan langsung.');
    }
    const filename = String(payload.filename||'nexora-media.mp4').replace(/["\\\r\n]/g,'_').slice(0,140);
    res.statusCode=200;
    res.setHeader('Content-Type',contentType);
    res.setHeader('Content-Disposition','attachment; filename="' + filename.replace(/[^\x20-\x7e]/g,'_') + '"');
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if (Number.isSafeInteger(length) && length > 0) res.setHeader('Content-Length',String(length));
    let bytes=0;
    const guard = new Transform({transform(chunk,_encoding,done) {
      bytes+=chunk.length;
      if (bytes>MAX_BYTES) done(new Error('Media melebihi batas 120 MB.'));
      else done(null,chunk);
    }});
    await pipeline(upstream,guard,res);
  } catch (err) {
    console.error('[nexora/download]',err.message);
    return fail(res, /token|kedaluwarsa|dikonfigurasi|tidak valid/i.test(err.message)?400:502,err.message.includes('fetch')?'Gagal menghubungi server media.':err.message);
  } finally {
    clearTimeout(tm);
    res.off('close',closeHandler);
  }
}
