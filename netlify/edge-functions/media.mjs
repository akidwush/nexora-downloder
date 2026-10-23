// Netlify Edge same-origin streaming gateway for signed media URLs.
// The existing /api/download Function validates signed tokens and applies
// the best-effort 4-video / 24h, per-instance IP quota first.
export const config = { path: '/api/media' };

const MAX_MEDIA_BYTES = 120 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const ALLOWED_REFERER_HOSTS = ['tiktok.com', 'instagram.com', 'youtube.com', 'facebook.com', 'x.com', 'twitter.com', 'reddit.com', 'bilibili.com', 'pinterest.com', 'spotify.com', 'bandcamp.com'];

function failure(status, message) {
  return new Response(JSON.stringify({error: message}), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export function validateMediaDestination(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('URL media tidak valid.'); }
  const host = url.hostname.toLowerCase();
  // Reject internal hosts, literal IPs, credentials, ports, and alternate schemes.
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      host.length > 253 || !host.includes('.') || host.endsWith('.') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) ||
      host.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(host) ||
      /^\d+$/.test(host) || /[^a-z0-9.\-]/.test(host)) {
    throw new Error('Tujuan media tidak aman.');
  }
  if (/\.(?:m3u8|mpd)$/i.test(url.pathname)) throw new Error('Playlist HLS/DASH belum didukung.');
  return url;
}

function decodedToken(token) {
  try {
    const encoded = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return {}; }
}

function safeFilename(token) {
  const meta = decodedToken(token);
  const value = typeof meta.filename === 'string' ? meta.filename : 'nexora-media.mp4';
  const safe = value.replace(/[^\x20-\x7e]/g, '_').replace(/["\\/;\r\n]/g, '_').trim().slice(0, 120);
  return safe || 'nexora-media.mp4';
}

function mediaHeaders(meta, range) {
  const headers = new Headers({'Accept': '*/*', 'Accept-Encoding': 'identity'});
  if (range) headers.set('Range', range);
  for (const name of ['Referer', 'Origin']) {
    const value = meta?.headers?.[name];
    if (typeof value !== 'string') continue;
    try {
      const origin = new URL(value);
      if (origin.protocol === 'https:' && ALLOWED_REFERER_HOSTS.some(host => origin.hostname === host || origin.hostname.endsWith('.' + host))) {
        headers.set(name, origin.origin + '/');
      }
    } catch { /* Ignore untrusted provider headers. */ }
  }
  return headers;
}

export default async function handler(request) {
  if (request.method !== 'GET') return failure(405, 'Gunakan metode GET.');
  const input = new URL(request.url);
  const token = input.searchParams.get('token');
  const mode = input.searchParams.get('mode') || 'download';
  if (!token || token.length > 14000 || !['preview', 'download'].includes(mode)) {
    return failure(400, 'Permintaan media tidak valid.');
  }
  const range = request.headers.get('Range');
  if (range && !/^bytes=\d*-\d*$/.test(range)) return failure(416, 'Rentang byte tidak valid.');

  try {
    // Validate the token and enforce the quota using the existing Node Function.
    // Never send its external Location header to the browser.
    const gateUrl = new URL('/api/download', request.url);
    gateUrl.searchParams.set('token', token);
    const gate = await fetch(gateUrl, {redirect: 'manual', cache: 'no-store'});
    if (gate.status !== 302) {
      const message = await gate.text();
      return new Response(message || JSON.stringify({error: 'Token atau kuota ditolak.'}), {
        status: gate.status >= 400 && gate.status <= 599 ? gate.status : 502,
        headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store'}
      });
    }
    let target = validateMediaDestination(gate.headers.get('Location') || '');
    const headers = mediaHeaders(decodedToken(token), range);
    let upstream;
    for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
      upstream = await fetch(target.href, {method: 'GET', redirect: 'manual', headers, cache: 'no-store'});
      if (!REDIRECTS.has(upstream.status)) break;
      if (attempt === MAX_REDIRECTS) {
        await upstream.body?.cancel();
        return failure(502, 'Terlalu banyak pengalihan dari server sumber.');
      }
      const destination = upstream.headers.get('Location');
      await upstream.body?.cancel();
      target = validateMediaDestination(new URL(destination || '', target).href);
    }
    if (![200, 206].includes(upstream.status)) {
      await upstream.body?.cancel();
      return failure(502, 'Server sumber menolak akses ke file media.');
    }
    const type = upstream.headers.get('Content-Type') || 'application/octet-stream';
    if (/^(?:text\/|application\/(?:json|xml|javascript|vnd\.apple\.mpegurl|dash\+xml|x-mpegurl))/i.test(type)) {
      await upstream.body?.cancel();
      return failure(502, 'Provider mengirim halaman atau playlist, bukan file media.');
    }
    const total = Number(upstream.headers.get('Content-Length'));
    if (Number.isFinite(total) && total > MAX_MEDIA_BYTES) {
      await upstream.body?.cancel();
      return failure(413, 'File melebihi batas 120 MB untuk mode unduh internal.');
    }
    if (!upstream.body) return failure(502, 'Server sumber tidak mengirim data media.');

    const resultHeaders = new Headers({
      'Content-Type': type,
      'Content-Disposition': (mode === 'preview' ? 'inline' : 'attachment') + '; filename="' + safeFilename(token) + '"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Video/large-file downloads use a hidden same-origin iframe to avoid
      // navigating Chrome Android away from the Nexora page.
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'no-referrer'
    });
    for (const key of ['Content-Length', 'Content-Range', 'Accept-Ranges']) {
      const value = upstream.headers.get(key);
      if (value) resultHeaders.set(key, value);
    }
    let bytes = 0;
    const guard = new TransformStream({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > MAX_MEDIA_BYTES) throw new Error('Media melebihi batas unduh internal.');
        controller.enqueue(chunk);
      }
    });
    return new Response(upstream.body.pipeThrough(guard), {status: upstream.status, headers: resultHeaders});
  } catch {
    return failure(502, 'Gagal mengambil media dari server sumber. Coba analisis ulang.');
  }
}
