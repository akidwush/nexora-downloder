import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { hasDownloadProxy } from './token.js';

export const VIDEO_LIMIT = 4;
export const WINDOW_HOURS = 24;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;
const MAX_BUCKETS = 5000;

// IMPORTANT: Only process-local memory. Serverless instances do NOT share counters.
const usageByIp = new Map();

/** Browser-independent when requests reach the same process, not identity tracking. */
export function getVisitorIp(req) {
  const onVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
  // Netlify Functions expose the verified client IP through Context.ip.
  // This value is set by our server-side Netlify adapter, never browser input.
  const raw = typeof req.netlifyClientIp === 'string'
    ? req.netlifyClientIp
    : onVercel
      ? (req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'])
      : req.socket?.remoteAddress;
  const ip = typeof raw === 'string' ? raw.split(',')[0].trim() : '';
  if (!isIP(ip)) throw new Error('IP pengunjung tidak tersedia.');
  return ip;
}
function ipv6Prefix64(ip) {
  const canonical = new URL('https://[' + ip + ']/').hostname.slice(1,-1).toLowerCase();
  const [left,right,extra] = canonical.split('::');
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
  if (kind === 6 && /^::ffff:(\d{1,3}\.){3}\d{1,3}$/i.test(ip)) {
    return 'v4:' + ip.slice(7);
  }
  if (kind === 6) return 'v6:' + ipv6Prefix64(ip);
  throw new Error('IP pengunjung tidak valid.');
}
export function isVideoLimiterConfigured() {
  return hasDownloadProxy();
}
export function ipQuotaKey(req) {
  if (!isVideoLimiterConfigured()) throw new Error('DOWNLOAD_SECRET belum dikonfigurasi.');
  return createHmac('sha256',process.env.DOWNLOAD_SECRET.trim())
    .update('nexora-memory-video-v1:' + ipBucket(getVisitorIp(req))).digest('hex');
}
function cleanup(now) {
  const cutoff = now - WINDOW_MS;
  for (const [key,hitTimes] of usageByIp) {
    if (!hitTimes.length || hitTimes[hitTimes.length - 1].at <= cutoff) usageByIp.delete(key);
  }
}
/**
 * Best-effort 4 video downloads / rolling 24 hours, per IP and warm Node process.
 * Synchronous and atomic within one process. NOT reliable across separate serverless
 * instances, function cold starts, or redeploys; no persistence or shared storage.
 * Only the salted digest is kept, never the raw IP.
 */
export function videoQuota(req, consume = false, now = Date.now(), identity = null) {
  if (!Number.isFinite(now)) throw new Error('Waktu kuota tidak valid.');
  const key = ipQuotaKey(req);
  // Token identity allows preview, seeking and saving without extra charges.
  // Only a SHA-256 digest is stored; token/provider URL never enter quota memory.
  if (identity !== null && (typeof identity !== 'string' || !/^[0-9a-f]{64}$/.test(identity))) {
    throw new Error('Identitas akses media tidak valid.');
  }
  const recent = (usageByIp.get(key) || []).filter(hit => hit.at > now - WINDOW_MS && hit.at <= now);
  if (recent.length) usageByIp.set(key,recent);
  else usageByIp.delete(key);
  const reused = identity !== null && recent.some(hit => hit.identity === identity);
  const allowed = reused || recent.length < VIDEO_LIMIT;
  if (consume && allowed && !reused) {
    if (!usageByIp.has(key) && usageByIp.size >= MAX_BUCKETS) cleanup(now);
    if (!usageByIp.has(key) && usageByIp.size >= MAX_BUCKETS) {
      throw new Error('Terlalu banyak pengunjung untuk limiter sementara.');
    }
    recent.push({at:now,identity});
    usageByIp.set(key,recent);
  }
  const used = recent.length;
  return {
    allowed,
    limit: VIDEO_LIMIT,
    used,
    remaining: VIDEO_LIMIT - used,
    resetAt: used ? new Date(recent[0].at + WINDOW_MS).toISOString() : null,
    reused,
    persistent: false
  };
}
