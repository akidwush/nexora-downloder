import { validateSource, normalizeMedia } from '../lib/platforms.js';
import { assertRemoteUrl, filenameFromMeta, isStreamManifest } from '../lib/safety.js';
import { hasDownloadProxy, makeDownloadToken } from '../lib/token.js';
import { isVideoLimiterConfigured, VIDEO_LIMIT } from '../lib/quota.js';
import { scrapeWithFallback, LINK_ONLY_PLATFORMS } from '../lib/scraper-router.js';

export const config = { maxDuration: 60 };
function json(res, status, payload) {
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  return res.end(JSON.stringify(payload));
}
/** Infer file extension from actual media URL first, then provider's format label. */
export function extensionForMedia(item, directUrl = '') {
  const allowed = {
    audio: ['mp3','m4a','aac','flac','ogg','opus','wav'],
    image: ['jpg','jpeg','png','webp','gif','avif'],
    video: ['mp4','webm','mov','m4v','mkv'],
    file: ['zip','rar','7z','pdf','txt','json','apk','bin','epub']
  };
  const formats = allowed[item.kind] || allowed.video;
  let pathExtension = '';
  try { pathExtension = new URL(directUrl).pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || ''; } catch {}
  if (formats.includes(pathExtension)) return pathExtension === 'jpeg' ? 'jpg' : pathExtension;
  const label = String(item.type || '') + ' ' + String(item.quality || '');
  const fromLabel = formats.find(ext => new RegExp('(?:^|[^a-z0-9])' + ext + '(?:$|[^a-z0-9])', 'i').test(label));
  if (fromLabel) return fromLabel === 'jpeg' ? 'jpg' : fromLabel;
  return item.kind === 'audio' ? 'm4a' : item.kind === 'image' ? 'jpg' : item.kind === 'file' ? 'bin' : 'mp4';
}
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

/** Prefer working formats, without losing unavailable formats when few work. */
export function selectDownloadOptions(options, limit = 12) {
  return [...options.filter(item => item.ready), ...options.filter(item => !item.ready)].slice(0,limit);
}

export default async function handler(req,res) {
  if (req.method !== 'POST') return json(res,405,{error:'Gunakan POST untuk menganalisis URL.'});
  try {
    if (Number(req.headers?.['content-length']||0)>4096) return json(res,413,{error:'Data terlalu besar.'});
    const {url,platform} = validateSource(req.body?.url);
    const engine=String(req.body?.engine||'auto');
    const provider=String(req.body?.provider||'auto');
    // Import both engines lazily, after the strict host allowlist has passed.
    // Scrapr is loaded only when necessary; no OTA install in a serverless function.
    const raw = await scrapeWithFallback({
      url,platform,engine,provider,
      scrapeMori: async (source,preference) => {
        const {scrapeUrl}=await import('@coflyn/mori/engine.js');
        return scrapeUrl(source,preference);
      },
      loadScrapr: () => import('@coflyn/scrapr')
    });
    const media = normalizeMedia(raw,platform);
    const processed = await Promise.all(media.options.map(async (item) => {
      let direct = item.sourceUrl;
      if (!direct.startsWith('https://')) {
        try { direct = await withTimeout(resolveUrl(direct),7000); }
        catch {return {type:item.type,quality:item.quality,kind:item.kind,ready:false,reason:'Server asal belum memberikan tautan langsung.'};}
      }
      let parsedMedia;
      try {parsedMedia = assertRemoteUrl(direct);} catch {return {type:item.type,quality:item.quality,kind:item.kind,ready:false,reason:'URL media ditolak oleh pemeriksaan keamanan.'};}
      // Shortlinks are metadata only: never stream arbitrary resolver targets.
      if (LINK_ONLY_PLATFORMS.has(platform) || item.kind==='link') {
        return {type:'Link tujuan',quality:item.quality,kind:'link',ready:true,
          targetUrl:parsedMedia.href,targetHost:parsedMedia.hostname};
      }
      if (isStreamManifest(parsedMedia.href)) {
        return {type:item.type,quality:item.quality,kind:item.kind,ready:false,reason:'Stream HLS/DASH perlu digabung dan belum didukung sebagai file tunggal.'};
      }
      const name = filenameFromMeta(media.title,extensionForMedia(item,direct));
      // Never leak a playable video URL before a server-side quota check.
      // With no shared database, enforce the best-effort per-process IP quota only at download time.
      if (!['audio','image'].includes(item.kind) && !isVideoLimiterConfigured()) {
        return {type:item.type,quality:item.quality,kind:item.kind,ready:false,
          reason:'Download video sementara tidak tersedia (DOWNLOAD_SECRET belum dikonfigurasi).'};
      }
      const token = makeDownloadToken({url:direct,filename:name,headers:item.headers,kind:item.kind});
      return token
        ? {type:item.type,quality:item.quality,kind:item.kind,ready:true,mirror:item.isMirror,
            downloadUrl:`/api/download?token=${encodeURIComponent(token)}`}
        : {type:item.type,quality:item.quality,kind:item.kind,ready:false,
            reason:'Unduhan internal belum dikonfigurasi.'};
    }));
    const options = selectDownloadOptions(processed);
    return json(res,200,{ok:true,platform,title:media.title,author:media.author,
      thumbnail:media.thumbnail,options,collectionItems:media.collectionItems,
      engineUsed:raw.engineUsed,providerUsed:raw.providerUsed,
      proxyEnabled:hasDownloadProxy(),videoLimit:VIDEO_LIMIT,videoLimiterEnabled:isVideoLimiterConfigured(),videoLimiterPersistent:false,truncated:media.options.length>options.length,
      notice:'Ketersediaan format mengikuti sumber. Kualitas/audio tidak dijamin pada setiap link.'});
  } catch (error) {
    const expected = /platform|URL|tautan|HTTPS|tidak valid|tidak didukung/i.test(error?.message || '');
    console.error('[nexora/analyze]', error?.message || error);
    return json(res,expected?400:502,{error:expected?error.message:'Ekstraksi gagal. Coba tautan publik lain atau ulangi nanti.',detail:expected?undefined:'Provider sumber mungkin membatasi akses server.'});
  }
}
