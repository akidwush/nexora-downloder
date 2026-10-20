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
  // Accept platform-provided forwarding headers only inside Vercel runtime.
  const raw = onVercel
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
    if (!hitTimes.length || hitTimes[hitTimes.length - 1] <= cutoff) usageByIp.delete(key);
  }
}
/**
 * Best-effort 4 video downloads / rolling 24 hours, per IP and warm Node process.
 * Synchronous and atomic within one process. NOT reliable across separate Vercel
 * instances, function cold starts, or redeploys; no persistence or shared storage.
 * Only the salted digest is kept, never the raw IP.
 */
export function videoQuota(req, consume = false, now = Date.now()) {
  if (!Number.isFinite(now)) throw new Error('Waktu kuota tidak valid.');
  const key = ipQuotaKey(req);
  const recent = (usageByIp.get(key) || []).filter(time => time > now - WINDOW_MS && time <= now);
  if (recent.length) usageByIp.set(key,recent);
  else usageByIp.delete(key);
  const allowed = recent.length < VIDEO_LIMIT;
  if (consume && allowed) {
    if (!usageByIp.has(key) && usageByIp.size >= MAX_BUCKETS) cleanup(now);
    if (!usageByIp.has(key) && usageByIp.size >= MAX_BUCKETS) {
      throw new Error('Terlalu banyak pengunjung untuk limiter sementara.');
    }
    recent.push(now);
    usageByIp.set(key,recent);
  }
  const used = recent.length;
  return {
    allowed,
    limit: VIDEO_LIMIT,
    used,
    remaining: VIDEO_LIMIT - used,
    resetAt: used ? new Date(recent[0] + WINDOW_MS).toISOString() : null,
    persistent: false
  };
}
