/** A deliberately small, metadata-only live provider smoke test. 
 * A public sample URL from coflyn/scrapr README is used. No files are downloaded.
 */
import {scrapeWithFallback} from '../lib/scraper-router.js';
const sample='https://www.tiktok.com/@_coflyn/video/7662892911448558865';
const results=[];
async function run(label,action) {
  const start=Date.now();
  try {
    const output=await Promise.race([
      Promise.resolve().then(action),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout after 20s')),20000))
    ]);
    const options=Array.isArray(output?.downloads)?output.downloads.length:0;
    results.push({engine:label,ok:options>0,options,ms:Date.now()-start,provider:output?.providerUsed||output?.server||'auto'});
  } catch(error) {
    results.push({engine:label,ok:false,ms:Date.now()-start,error:String(error?.message||error).slice(0,200)});
  }
}
await run('Mori Core',async()=>{
  const {scrapeUrl}=await import('@coflyn/mori/engine.js');
  return scrapeUrl(sample,'auto');
});
await run('Scrapr / TikTokIO',()=>scrapeWithFallback({
  url:sample,platform:'tiktok',engine:'scrapr',provider:'tiktokio',
  loadScrapr:()=>import('@coflyn/scrapr')
}));
console.log('NEXORA_LIVE_ENGINE_SMOKE='+JSON.stringify(results));
if (results.every(result=>!result.ok)) {
  console.error('Neither engine returned media metadata. External site restrictions may be responsible.');
  process.exit(2);
}
process.exit(0);
