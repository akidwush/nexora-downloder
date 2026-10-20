import { videoQuota, isVideoLimiterConfigured, VIDEO_LIMIT } from '../lib/quota.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).end(JSON.stringify({error:'Gunakan GET.'}));
  if (!isVideoLimiterConfigured()) return res.status(503).end(JSON.stringify({error:'Kuota video belum dikonfigurasi.',limit:VIDEO_LIMIT}));
  try {
    const data = await videoQuota(req);
    return res.status(200).end(JSON.stringify(data));
  } catch {
    return res.status(503).end(JSON.stringify({error:'Layanan kuota sedang tidak tersedia.'}));
  }
}
