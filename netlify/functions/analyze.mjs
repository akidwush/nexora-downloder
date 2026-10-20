import analyze from '../../api/analyze.js';

export const config = {
  path: '/api/analyze',
  // Short burst guard for expensive provider requests; NOT the 24h download quota.
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 60, windowLimit: 12 }
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
  });
}

/** Adapt the current Node handler without shipping a separate HTTP server. */
export default async function handler(request) {
  if (request.method !== 'POST') return json(405,{error:'Gunakan POST untuk menganalisis URL.'});
  let body;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw,'utf8') > 4096) return json(413,{error:'Data terlalu besar.'});
    body = JSON.parse(raw);
  } catch {
    return json(400,{error:'Body JSON tidak valid.'});
  }
  let status = 200;
  let payloadText = '';
  const headers = new Headers();
  const res = {
    status(code){status=code;return this;},
    setHeader(name,value){headers.set(name,value);return this;},
    end(content){payloadText=String(content ?? '');return this;}
  };
  await analyze({
    method:'POST',
    headers:{'content-length':String(Buffer.byteLength(JSON.stringify(body),'utf8'))},
    body
  },res);
  // A redirect opens the original media source; Netlify never proxies large videos.
  try {
    const data = JSON.parse(payloadText);
    if (data && status === 200) {
      data.deliveryMode = 'redirect';
      payloadText = JSON.stringify(data);
    }
  } catch {return json(502,{error:'Respons analisis tidak valid.'});}
  return new Response(payloadText,{status,headers});
}
