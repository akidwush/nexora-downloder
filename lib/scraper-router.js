/**
 * Mori Core + Scrapr router. Loads Scrapr only after input validation and only
 * if Mori fails, or the visitor explicitly chooses Scrapr / a named provider.
 * No runtime OTA downloads, child processes, or browser automation on Netlify.
 */
export const SCRAPR_PROVIDERS = Object.freeze({
  tiktok:['tiktokio','tikdownloader','snaptik','savetik','ssstik'],
  instagram:['indown','snapsave','snapinsta','direct'],
  youtube:['ytmp3gg','ytmp3','playlist'],
  facebook:['snapsave','fdown'],
  twitter:['tvd','savetwt','tweeload','direct'],
  spotify:['spotidown','soundloaders','spotmate','spotisaver'],
  pinterest:['pindown','direct'],
  bandcamp:['direct','bandcampdownloader'],
  applemusic:['aplmate'], bilibili:['direct'], douyin:['direct'],
  reddit:['rapidsave'], threads:['threadster'], rednote:['direct'],
  pixiv:['ajax'], terabox:['sechno'], soundcloud:['klickaud'],
  mediafire:['mediafire'], sfile:['sfile'], pixeldrain:['pixeldrain'],
  catbox:['catbox'], krakenfiles:['krakenfiles'], gdrive:['gdrive'],
  doodstream:['doodstream'],
  safelinku:['safelinku'], sub2unlock:['sub2unlock'],
  rekonise:['rekonise'], unshorten:['unshorten']
});

export const RESOLVER_PLATFORMS = new Set([
  'mediafire','sfile','pixeldrain','catbox','krakenfiles','gdrive',
  'doodstream','safelinku','sub2unlock','rekonise','unshorten'
]);
export const LINK_ONLY_PLATFORMS = new Set(['safelinku','sub2unlock','rekonise','unshorten']);

const PLATFORM_MODULE = Object.freeze(
  Object.fromEntries(Object.keys(SCRAPR_PROVIDERS).map(name =>
    [name,RESOLVER_PLATFORMS.has(name)?'resolver':name]))
);

export function availableProviders(platform) {
  return SCRAPR_PROVIDERS[platform] ? [...SCRAPR_PROVIDERS[platform]] : [];
}

/** A provider's status flag is not enough: it must return usable media or items. */
export function isUsableMedia(value) {
  const media=value?.result && typeof value.result==='object' ? value.result : value;
  if (!media || typeof media!=='object' || value?.status===false) return false;
  const valid=(item)=>item && typeof item.url==='string' && item.url.trim().length>0;
  if (Array.isArray(media.downloads) && media.downloads.some(valid)) return true;
  if (Array.isArray(media.items) && media.items.some(valid)) return true;
  if (Array.isArray(media.images) && media.images.some(item=>
    typeof item==='string' && item.startsWith('https://') || valid(item))) return true;
  return typeof (media.destinationUrl||media.url)==='string' && Boolean((media.destinationUrl||media.url).trim());
}

function timeout(operation, ms) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Scraper timeout')),ms);})
  ]).finally(()=>clearTimeout(timer));
}

function unwrapScrapr(response, platform, provider) {
  const data=response?.result && typeof response.result==='object' ? response.result : response;
  if (!isUsableMedia(response)) throw new Error('Scrapr tidak menyediakan format siap dianalisis.');
  const url=data.destinationUrl||data.url;
  const downloads=Array.isArray(data.downloads) && data.downloads.length
    ? data.downloads
    : (typeof url==='string' && url ? [{
        url,type:LINK_ONLY_PLATFORMS.has(platform)?'link':(data.type||'file'),
        quality:LINK_ONLY_PLATFORMS.has(platform)?'Resolved link':'Direct download'
      }] : []);
  return {...data,downloads,engineUsed:'scrapr',providerUsed:provider};
}

/**
 * Limit expensive provider calls. Provider implementations may not support
 * cancellation; a timeout rejects the result but cannot stop upstream code.
 * Never run fallbacks in parallel or trust caller-supplied provider names.
 */
export async function scrapeWithFallback({
  url,platform,engine='auto',provider='auto',
  scrapeMori,loadScrapr,
  moriTimeoutMs=16000,scraprTimeoutMs=8500,maxScraprAttempts=3
}) {
  if (!['auto','mori','scrapr'].includes(engine)) throw new Error('Engine tidak didukung.');
  const providers=availableProviders(platform);
  if (!providers.length) throw new Error('Platform belum didukung oleh scraper.');
  if (provider!=='auto' && !providers.includes(provider)) throw new Error('Provider tidak dikenal untuk platform ini.');
  if (engine==='mori' && provider!=='auto') throw new Error('Pilih Scrapr untuk provider khusus.');
  if (engine==='mori' && RESOLVER_PLATFORMS.has(platform)) throw new Error('Platform ini membutuhkan Scrapr.');

  let lastError;
  if (engine!=='scrapr' && provider==='auto' && !RESOLVER_PLATFORMS.has(platform)) {
    try {
      if (typeof scrapeMori!=='function') throw new Error('Mori Core tidak tersedia.');
      const raw=await timeout(()=>scrapeMori(url,'auto'),moriTimeoutMs);
      if (isUsableMedia(raw)) {
        return {...raw,engineUsed:'mori',providerUsed:String(raw.server||'auto').slice(0,64)};
      }
      lastError=new Error('Mori tidak menemukan format yang dapat diproses.');
    } catch(error) {lastError=error;}
    if (engine==='mori') throw lastError;
  }

  if (typeof loadScrapr!=='function') throw new Error('Scrapr belum tersedia.');
  const module=await timeout(loadScrapr,5000);
  const scrapr=module?.default||module;
  const methods=provider==='auto' ? providers.slice(0,Math.max(1,Math.min(5,maxScraprAttempts))) : [provider];
  for (const name of methods) {
    const fn=scrapr?.[PLATFORM_MODULE[platform]]?.[name];
    if (typeof fn!=='function') continue;
    try {
      const result=await timeout(()=>fn(url),scraprTimeoutMs);
      if (isUsableMedia(result)) return unwrapScrapr(result,platform,name);
      lastError=new Error('Provider tidak menemukan media.');
    } catch(error) {lastError=error;}
  }
  console.warn('[nexora/router]',platform,'semua provider gagal:',lastError?.message||'Tidak tersedia');
  throw new Error('Semua scraper yang dicoba gagal. Coba lagi atau pilih provider lain.');
}
