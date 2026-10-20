import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { hasDownloadProxy } from './token.js';

export const VIDEO_LIMIT = 4;
export const WINDOW_HOURS = 24;

/** Same public IP => same quota, even if cookies or browsers change. */
export function getVisitorIp(req) {
  // Vercel overwrites these headers (no client spoofing) on its functions.
  // Outside Vercel never trust arbitrary X-Forwarded-For supplied by visitors.
  const hosted = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
  const raw = hosted
    ? (req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'])
    : req.socket?.remoteAddress;
  const ip = typeof raw === 'string' ? raw.trim() : '';
  if (!isIP(ip)) throw new Error('IP pengunjung tidak tersedia.');
  return ip;
}
function ipv6Prefix64(ip) {
  const canonical = new URL('https://[' + ip + ']/').hostname.slice(1,-1).toLowerCase();
  const [left, right, extra] = canonical.split('::');
  if (extra !== undefined) throw new Error('Alamat IPv6 tidak valid.');
  const start = left ? left.split(':') : [];
  const end = right ? right.split(':') : [];
  const groups = right === undefined ? start : [...start,...Array(8 - start.length - end.length).fill('0'),...end];
  if (groups.length !== 8) throw new Error('Alamat IPv6 tidak valid.');
  return groups.slice(0,4).map(part => part.padStart(4,'0')).join(':');
}
export function ipBucket(ip) {
  const kind = isIP(ip);
  if (kind === 4) return 'v4:' + ip;
  // IPv4-mapped IPv6 must not collapse all visitors into a single ::/64 bucket.
  if (kind === 6 && /^::ffff:(\d{1,3}\.){3}\d{1,3}$/i.test(ip)) {
    return 'v4:' + ip.slice(7);
  }
  if (kind === 6) return 'v6:' + ipv6Prefix64(ip);
  throw new Error('IP pengunjung tidak valid.');
}
export function isVideoLimiterConfigured() {
  const base = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SECRET_KEY || '';
  try {
    const url = new URL(base);
    return hasDownloadProxy() && key.length > 20 &&
      url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') &&
      !url.username && !url.password && !url.port;
  } catch { return false; }
}
export function ipQuotaKey(req) {
  if (!isVideoLimiterConfigured()) throw new Error('Kuota video belum dikonfigurasi.');
  const bucket = ipBucket(getVisitorIp(req));
  return createHmac('sha256', process.env.DOWNLOAD_SECRET)
    .update('nexora-video-limit-v1:' + bucket).digest('hex');
}
/** Atomic database function. No in-memory counters or browser storage. */
export async function videoQuota(req, consume = false) {
  const hash = ipQuotaKey(req);
  const base = process.env.SUPABASE_URL.replace(/\/+$/,'');
  const secret = process.env.SUPABASE_SECRET_KEY;
  const headers = {'apikey':secret,'Content-Type':'application/json'};
  // Legacy service_role keys are JWTs; new sb_secret keys go in apikey only.
  if (!secret.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + secret;
  let response;
  try {
    response = await fetch(base + '/rest/v1/rpc/nexora_downloader_quota',{
      method:'POST',headers,body:JSON.stringify({p_ip_hash:hash,p_consume:Boolean(consume)}),
      cache:'no-store',signal:AbortSignal.timeout(5000)
    });
  } catch { throw new Error('Penyimpanan kuota sedang tidak tersedia. Coba lagi nanti.'); }
  if (!response.ok) throw new Error('Penyimpanan kuota sedang tidak tersedia. Coba lagi nanti.');
  let data;
  try { data=await response.json(); } catch {}
  if (!data || data.limit!==VIDEO_LIMIT || !Number.isInteger(data.remaining) ||
      data.remaining<0 || data.remaining>VIDEO_LIMIT || typeof data.allowed!=='boolean') {
    throw new Error('Respons kuota tidak valid.');
  }
  return {allowed:data.allowed,remaining:data.remaining,used:data.used,limit:VIDEO_LIMIT,resetAt:data.resetAt || null};
}
