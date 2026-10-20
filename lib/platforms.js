/** Host allowlist for the input (not substring matching). */
export const PLATFORM_DEFS = [
  {id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com', 'tt.site']},
  {id: 'instagram', label: 'Instagram', hosts: ['instagram.com']},
  {id: 'youtube', label: 'YouTube', hosts: ['youtube.com','youtu.be','youtube-nocookie.com']},
  {id: 'facebook', label: 'Facebook', hosts: ['facebook.com','fb.watch']},
  {id: 'twitter', label: 'X / Twitter', hosts: ['x.com','twitter.com','fxtwitter.com','vxtwitter.com','fixupx.com']},
  {id: 'pinterest', label: 'Pinterest', hosts: ['pinterest.com','pin.it']},
  {id: 'spotify', label: 'Spotify', hosts: ['spotify.com']},
  {id: 'reddit', label: 'Reddit', hosts: ['reddit.com','redd.it']},
  {id: 'threads', label: 'Threads', hosts: ['threads.net','threads.com']},
  {id: 'applemusic', label: 'Apple Music', hosts: ['music.apple.com']},
  {id: 'bilibili', label: 'Bilibili', hosts: ['bilibili.com','b23.tv','bili.im','bilibili.tv']},
  {id: 'douyin', label: 'Douyin', hosts: ['douyin.com']},
  {id: 'rednote', label: 'RedNote', hosts: ['xiaohongshu.com','xhslink.com','xhslink.cn','rednote.com']},
  {id: 'pixiv', label: 'Pixiv', hosts: ['pixiv.net']},
  {id: 'bandcamp', label: 'Bandcamp', hosts: ['bandcamp.com']},
  {id: 'terabox', label: 'TeraBox', hosts: ['terabox.com','teraboxapp.com','1024tera.com','nephobox.com','4funbox.com','mirrobox.com','momerybox.com','tibibox.com']}
];
const exactOrSubdomain = (hostname, domain) => hostname === domain || hostname.endsWith('.' + domain);
export function validateSource(raw) {
  if (typeof raw !== 'string' || raw.length < 10 || raw.length > 2200) throw new Error('Tautan tidak valid atau terlalu panjang.');
  let parsed;
  try { parsed = new URL(raw.trim()); } catch { throw new Error('Masukkan URL yang lengkap, diawali https://.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) throw new Error('Hanya tautan HTTPS publik yang didukung.');
  const platform = PLATFORM_DEFS.find((p) => p.hosts.some((domain) => exactOrSubdomain(parsed.hostname, domain)));
  if (!platform) throw new Error('Platform belum didukung. Pilih salah satu dari 16 platform yang tersedia.');
  return {url: parsed.toString(), platform: platform.id, label: platform.label};
}

export function classifyMedia(type = '', quality = '', url = '') {
  // File extensions outrank vague labels such as "no audio" on a video.
  const extension = String(url).match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  if (['mp4','webm','mov','m4v','mkv'].includes(extension)) return 'video';
  if (['mp3','m4a','aac','flac','ogg','opus','wav'].includes(extension)) return 'audio';
  if (['jpg','jpeg','png','webp','gif','avif'].includes(extension)) return 'image';
  const text = (String(type) + ' ' + String(quality)).toLowerCase();
  if (/\b(video|mp4|webm|mov|m4v|mkv)\b/.test(text)) return 'video';
  if (/\b(photo|image|jpeg|jpg|png|webp|gif|avif|gallery|artwork)\b/.test(text)) return 'image';
  if (/\b(audio|mp3|m4a|music|sound|aac|flac|ogg|opus|wav)\b/.test(text)) return 'audio';
  return 'video';
}

export function normalizeMedia(media, platform) {
  const title = String(media?.title || 'Media tanpa judul').slice(0,220);
  const author = String(media?.author || media?.username || '').slice(0,120);
  const candidateThumb = media?.thumbnail || media?.cover || media?.thumb || media?.image || '';
  let thumbnail = '';
  if (typeof candidateThumb === 'string') {try {if (new URL(candidateThumb).protocol === 'https:') thumbnail = candidateThumb;} catch {}}
  const variants = Array.isArray(media?.downloads) ? media.downloads : [];
  // Filter empty provider placeholders BEFORE capping results to 20.
  // Keep original positions so the provider's order is preserved.
  const options = variants
    .map((it,index) => ({it,index}))
    .filter(({it}) => typeof it?.url === 'string' && it.url.trim())
    .slice(0,20)
    .map(({it,index}) => {
      const type = String(it.type || 'Media').slice(0,80);
      const quality = String(it.quality || '').slice(0,50);
      return {index, type, quality, kind: classifyMedia(type, quality, it.url), sourceUrl: it.url,
        isMirror: Boolean(it.isMirror), headers: safeMediaHeaders(it.headers)};
    });
  return {title, author, platform, thumbnail, options};
}
/** Never relay secrets/cookies or arbitrary attacker headers. */
export function safeMediaHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const filtered = {};
  for (const key of ['Referer','Origin']) {
    const input = value[key] ?? value[key.toLowerCase()];
    if (typeof input !== 'string' || input.length > 300) continue;
    try {
      const url = new URL(input);
      if (url.protocol === 'https:' && !url.username && !url.password) filtered[key] = url.origin + '/';
    } catch {}
  }
  return filtered;
}
