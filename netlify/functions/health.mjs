import {hasDownloadProxy} from '../../lib/token.js';
import {isVideoLimiterConfigured,VIDEO_LIMIT} from '../../lib/quota.js';

export const config = {path:'/api/health'};

export default function handler(request) {
  if(request.method !== 'GET') return new Response(JSON.stringify({error:'Gunakan GET.'}),{
    status:405,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
  });
  return new Response(JSON.stringify({
    ok:true,service:'All Downloader Nexora',hosting:'Netlify',
    extractor:'Mori npm adapter',deliveryMode:'redirect',
    proxyEnabled:false,tokenEnabled:hasDownloadProxy(),
    videoLimiterEnabled:isVideoLimiterConfigured(),videoLimitPer24h:VIDEO_LIMIT,
    videoLimiterPersistent:false
  }),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
