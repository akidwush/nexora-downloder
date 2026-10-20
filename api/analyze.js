import { validateSource, normalizeMedia } from '../lib/platforms.js';
import { assertRemoteUrl, filenameFromMeta } from '../lib/safety.js';
import { hasDownloadProxy, makeDownloadToken } from '../lib/token.js';

export const config = { maxDuration: 60 };
function json(res, status, payload) {
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  return res.end(JSON.stringify(payload));
}
const suffix = (item) => {
  const t = (item.type + ' ' + item.quality).toLowerCase();
  if (item.kind === 'audio') return /m4a|aac/.test(t) ? 'm4a' : 'mp3';
  if (item.kind === 'image') return /webp/.test(t) ? 'webp' : /png/.test(t) ? 'png' : 'jpg';
  return 'mp4';
};
/** Clear timers on both success and failure (including scraper errors). */
export function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Resolusi link terlalu lama')), ms);
    Promise.resolve(promise).then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

export default async function handler(req,res) {
  if (req.method !== 'POST') return json(res,405,{error:'Gunakan POST untuk menganalisis URL.'});
  try {
    if (Number(req.headers?.['content-length']||0)>4096) return json(res,413,{error:'Data terlalu besar.'});
    const {url,platform} = validateSource(req.body?.url);
    // Lazy import prevents Mori bundle loading until a valid supported URL is given.
    const {scrapeUrl,resolveUrl} = await import('@coflyn/mori/engine.js');
    const raw = await withTimeout(scrapeUrl(url,'auto'),40000);
    const media = normalizeMedia(raw,platform);
    const selected = media.options.slice(0,12);
    const options = await Promise.all(selected.map(async (item) => {
      let direct = item.sourceUrl;
      if (!direct.startsWith('https://')) {
        try { direct = await withTimeout(resolveUrl(direct),7000); }
        catch {return {type:item.type,quality:item.quality,kind:item.kind,ready:false,reason:'Server asal belum memberikan tautan langsung.'};}
      }
      try {assertRemoteUrl(direct);} catch {return {type:item.type,quality:item.quality,kind:item.kind,ready:false,reason:'URL media ditolak oleh pemeriksaan keamanan.'};}
      const name = filenameFromMeta(media.title,suffix(item));
      const token = makeDownloadToken({url:direct,filename:name,headers:item.headers});
      return {type:item.type,quality:item.quality,kind:item.kind,ready:true,mirror:item.isMirror,
        directUrl:direct,downloadUrl:token?`/api/download?token=${encodeURIComponent(token)}`:null};
    }));
    return json(res,200,{ok:true,platform,title:media.title,author:media.author,
      thumbnail:media.thumbnail,options,proxyEnabled:hasDownloadProxy(),truncated:media.options.length>12,
      notice:'Ketersediaan format mengikuti sumber. Kualitas/audio tidak dijamin pada setiap link.'});
  } catch (error) {
    const expected = /platform|URL|tautan|HTTPS|tidak valid|tidak didukung/i.test(error?.message || '');
    console.error('[nexora/analyze]', error?.message || error);
    return json(res,expected?400:502,{error:expected?error.message:'Ekstraksi gagal. Coba tautan publik lain atau ulangi nanti.',detail:expected?undefined:'Provider sumber mungkin membatasi akses server.'});
  }
}
