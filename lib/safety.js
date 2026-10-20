import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
const unsafeIpv4 = (ip) => {
  const [a,b,c] = ip.split('.').map(Number);
  // Deny private, shared, benchmarking, multicast and documentation networks.
  // 192.0.0.0/24 is IETF protocol-assignment space, not a public CDN.
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113);
};
const unsafeIpv6 = (ip) => {
  // Normalize equivalent text encodings before inspecting reserved ranges.
  let canonical;
  try { canonical = new URL('https://[' + ip + ']/').hostname.slice(1,-1).toLowerCase(); }
  catch { return true; }
  const first = Number.parseInt(canonical.split(':')[0], 16);
  // Globally-routable unicast only; reject documentation, Teredo, 6to4, ORCHID.
  return !Number.isInteger(first) || first < 0x2000 || first > 0x3fff ||
    first >= 0x3ff0 ||
    /^2001:db8(?::|$)/.test(canonical) ||
    /^2001:(?:0(?::|$)|:|1[0-9a-f](?::|$)|2[0-9a-f](?::|$))/.test(canonical) ||
    /^2002(?::|$)/.test(canonical);
};

export function assertRemoteUrl(value) {
  if (typeof value !== 'string' || value.length>7000) throw new Error('Alamat media tidak valid.');
  let target;
  try {target = new URL(value);} catch {throw new Error('Alamat media tidak valid.');}
  if (target.protocol !== 'https:' || target.username || target.password || target.port || isIP(target.hostname.replace(/^\[|\]$/g,'')) || target.hostname==='localhost' || target.hostname.endsWith('.localhost') || target.hostname.endsWith('.local') || !target.hostname.includes('.')) {
    throw new Error('Alamat media tidak aman.');
  }
  return target;
}
export function assertPublicAddresses(addresses) {
  if (!Array.isArray(addresses) || !addresses.length) throw new Error('Server media tidak dapat ditemukan.');
  for (const {address, family} of addresses) {
    if (typeof address !== 'string' || isIP(address) !== family ||
        (family === 4 && unsafeIpv4(address)) ||
        (family === 6 && unsafeIpv6(address))) {
      throw new Error('Alamat jaringan privat tidak diizinkan.');
    }
  }
  return addresses;
}
/** Resolve and validate every DNS answer before making the connection. */
export async function resolvePublicAddresses(hostname) {
  if (typeof hostname !== 'string' || !hostname || isIP(hostname)) {
    throw new Error('Hostname media tidak valid.');
  }
  return assertPublicAddresses(await lookup(hostname, {all:true}));
}
export async function assertPublicDns(url) {
  const target = assertRemoteUrl(url);
  await resolvePublicAddresses(target.hostname);
  return target;
}
/** Playlists cannot be downloaded as single playable media files. */
export function isStreamManifest(url, contentType = '') {
  let path = '';
  try { path = decodeURIComponent(new URL(url).pathname); }
  catch { return false; }
  const mime = String(contentType).split(';')[0].trim().toLowerCase();
  return /\.(?:m3u8|mpd)$/i.test(path) ||
    ['application/vnd.apple.mpegurl','application/x-mpegurl','application/dash+xml','audio/mpegurl','audio/x-mpegurl'].includes(mime);
}

/** Reject incomplete upstream responses, playlists, and common error documents. */
export function mediaResponseProblem(statusCode, contentType, url) {
  if (statusCode !== 200) return 'Server media tidak mengirim file lengkap.';
  if (isStreamManifest(url, contentType)) return 'Stream HLS/DASH belum didukung sebagai file tunggal.';
  const mime = String(contentType).split(';')[0].trim().toLowerCase();
  if (mime.startsWith('text/') || mime === 'application/json' ||
      mime === 'application/javascript' || mime === 'application/xml' ||
      mime.endsWith('+json') || mime.endsWith('+xml')) return 'Provider tidak mengembalikan file media.';
  return null;
}

export function filenameFromMeta(meta, extension) {
  const safe = String(meta || 'nexora-media').normalize('NFKD').replace(/[^\w\- .()]/g,'_').replace(/[\\/\r\n]/g,'_').replace(/\s+/g,' ').trim().slice(0,100) || 'nexora-media';
  const ext = (extension || 'mp4').replace(/[^a-z0-9]/g,'').slice(0,6) || 'mp4';
  return safe.toLowerCase().endsWith('.'+ext) ? safe : safe+'.'+ext;
}
