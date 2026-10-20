import {hasDownloadProxy} from '../lib/token.js';
import {isVideoLimiterConfigured, VIDEO_LIMIT} from '../lib/quota.js';
export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,service:'All Downloader Nexora',extractor:'Mori npm adapter',proxyEnabled:hasDownloadProxy(),videoLimiterEnabled:isVideoLimiterConfigured(),videoLimitPer24h:VIDEO_LIMIT});
}
