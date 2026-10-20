import { createHmac, timingSafeEqual } from 'node:crypto';
const getSecret = () => (process.env.DOWNLOAD_SECRET || '').trim();
const base64url = (txt) => Buffer.from(txt, 'utf8').toString('base64url');
const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');
export function hasDownloadProxy() { return getSecret().length >= 32; }
export function makeDownloadToken({url, filename, headers, kind}) {
  const secret = getSecret();
  if (secret.length < 32) return null;
  const payload = base64url(JSON.stringify({url, filename, headers, kind: ['video','audio','image'].includes(kind) ? kind : 'video', exp: Date.now() + 10*60*1000}));
  return `${payload}.${sign(payload, secret)}`;
}
export function verifyDownloadToken(token) {
  const secret = getSecret();
  if (secret.length < 32 || typeof token !== 'string' || token.length > 14000) throw new Error('Server download belum dikonfigurasi.');
  const pieces = token.split('.');
  if (pieces.length !== 2) throw new Error('Token unduhan tidak valid.');
  const [body, provided] = pieces;
  const expected = sign(body, secret);
  const a = Buffer.from(provided); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a,b)) throw new Error('Token unduhan tidak valid.');
  let decoded;
  try { decoded = JSON.parse(Buffer.from(body,'base64url').toString('utf8')); } catch {throw new Error('Token unduhan rusak.');}
  if (!decoded || !Number.isFinite(decoded.exp) || decoded.exp < Date.now() || decoded.exp > Date.now()+11*60*1000) throw new Error('Tautan unduhan kedaluwarsa. Analisis ulang URL.');
  if (typeof decoded.url !== 'string' || decoded.url.length > 7000) throw new Error('URL unduhan tidak valid.');
  return decoded;
}
