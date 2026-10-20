import {hasDownloadProxy} from '../lib/token.js';
export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,service:'All Downloader Nexora',extractor:'Mori npm adapter',proxyEnabled:hasDownloadProxy()});
}
