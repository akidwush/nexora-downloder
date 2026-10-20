import {verifyDownloadToken} from '../../lib/token.js';
import {createHash} from 'node:crypto';
import {assertRemoteUrl,isStreamManifest} from '../../lib/safety.js';
import {videoQuota,VIDEO_LIMIT} from '../../lib/quota.js';

export const config = {path:'/api/download'};

function error(status,message,extra={}) {
  return new Response(JSON.stringify({error:message}),{
    status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}
  });
}

/**
 * Netlify Functions cap streamed responses at 20 MB, so do NOT proxy media.
 * Validate a signed short-lived token, apply best-effort per-instance video
 * quota only once per signed token (preview / playback seeks / download),
 * then redirect the browser to the HTTPS media origin.
 * The origin decides whether the media is downloaded or played in-browser.
 */
export default function handler(request,context={}) {
  if(request.method !== 'GET') return error(405,'Gunakan GET.');
  let payload, media, token;
  try {
    token=new URL(request.url).searchParams.get('token');
    payload=verifyDownloadToken(token);
    media=assertRemoteUrl(payload.url);
  } catch {return error(400,'Token unduhan tidak valid, kedaluwarsa, atau server belum dikonfigurasi.');}
  if(isStreamManifest(media.href)) return error(422,'Stream HLS/DASH belum bisa diunduh sebagai satu file.');
  let extra={};
  // Missing kind on older tokens is considered video (never a free bypass).
  if(payload.kind !== 'audio' && payload.kind !== 'image') {
    if(typeof context.ip !== 'string') return error(503,'IP pengunjung tidak tersedia.');
    let quota;
    try {
      const identity=createHash('sha256').update(token).digest('hex');
      quota=videoQuota({netlifyClientIp:context.ip},true,Date.now(),identity);
    } catch {return error(503,'Limiter video sementara tidak tersedia.');}
    extra={'X-RateLimit-Limit':String(VIDEO_LIMIT),'X-RateLimit-Remaining':String(quota.remaining)};
    if(!quota.allowed) {
      if(quota.resetAt) {
        const wait=Math.ceil((Date.parse(quota.resetAt)-Date.now())/1000);
        if(Number.isFinite(wait) && wait>0) extra['Retry-After']=String(wait);
      }
      return error(429,'Batas sementara 4 video per IP dalam 24 jam pada server ini sudah habis.',extra);
    }
  }
  return new Response(null,{status:302,headers:{
    Location:media.href,
    'Cache-Control':'private, no-store',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    ...extra
  }});
}
