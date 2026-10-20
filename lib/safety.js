import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
const unsafeIpv4 = (ip) => {
  const octets = ip.split('.').map(Number);
  const [a,b,c] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >=16 && b<=31) || (a === 192 && b===168) || (a === 100 && b>=64 && b<=127) || (a === 192 && b===0 && c===0) || (a === 192 && b===0 && c===2) || (a === 198 && (b===18 || b===19 || (b===51 && c===100))) || (a === 203 && b===0 && c===113);
};
export function assertRemoteUrl(value) {
  if (typeof value !== 'string' || value.length>7000) throw new Error('Alamat media tidak valid.');
  let target;
  try {target = new URL(value);} catch {throw new Error('Alamat media tidak valid.');}
  if (target.protocol !== 'https:' || target.username || target.password || target.port || isIP(target.hostname) || target.hostname==='localhost' || target.hostname.endsWith('.localhost') || target.hostname.endsWith('.local') || !target.hostname.includes('.')) {
    throw new Error('Alamat media tidak aman.');
  }
  return target;
}
export async function assertPublicDns(url) {
  const target = assertRemoteUrl(url);
  const addresses = await lookup(target.hostname, {all:true});
  if (!addresses.length) throw new Error('Server media tidak dapat ditemukan.');
  for (const rec of addresses) {
    const ip = rec.address;
    if (rec.family === 4 && unsafeIpv4(ip)) throw new Error('Alamat jaringan privat tidak diizinkan.');
    if (rec.family === 6) {
      const lower = ip.toLowerCase();
      if (lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe') || lower.startsWith('ff') || lower.startsWith('::ffff:')) throw new Error('Alamat jaringan privat tidak diizinkan.');
    }
  }
  return target;
}
export function filenameFromMeta(meta, extension) {
  const safe = String(meta || 'nexora-media').normalize('NFKD').replace(/[^\w\- .()]/g,'_').replace(/[\\/\r\n]/g,'_').replace(/\s+/g,' ').trim().slice(0,100) || 'nexora-media';
  const ext = (extension || 'mp4').replace(/[^a-z0-9]/g,'').slice(0,6) || 'mp4';
  return safe.toLowerCase().endsWith('.'+ext) ? safe : safe+'.'+ext;
}
