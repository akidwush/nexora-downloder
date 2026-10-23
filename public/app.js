const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const make = (tag, className = '', text = '') => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
};
const icon = (id) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${id}`);
  svg.append(use);
  svg.setAttribute('aria-hidden', 'true');
  return svg;
};
const supported = {
  tiktok:['tiktok.com','tt.site'], instagram:['instagram.com'],
  youtube:['youtube.com','youtu.be','youtube-nocookie.com'], facebook:['facebook.com','fb.watch'],
  twitter:['twitter.com','x.com','fxtwitter.com','vxtwitter.com','fixupx.com'],
  pinterest:['pinterest.com','pin.it'], spotify:['spotify.com'],
  reddit:['reddit.com','redd.it'], threads:['threads.com','threads.net'],
  applemusic:['music.apple.com'],bilibili:['bilibili.com','b23.tv','bili.im','bilibili.tv'],
  douyin:['douyin.com'],rednote:['xiaohongshu.com','rednote.com','xhslink.com','xhslink.cn'],
  pixiv:['pixiv.net'],bandcamp:['bandcamp.com'],
  terabox:['terabox.com','teraboxapp.com','1024tera.com','nephobox.com','4funbox.com','mirrobox.com','momerybox.com','tibibox.com'],
  soundcloud:['soundcloud.com'],mediafire:['mediafire.com'],sfile:['sfile.mobi','sfile.co'],
  pixeldrain:['pixeldrain.com'],catbox:['catbox.moe'],krakenfiles:['krakenfiles.com'],
  gdrive:['drive.google.com','docs.google.com'],
  doodstream:['doodstream.com','ds2play.com','doods.pro','dood.to','dood.so','dood.ws','dood.pm','dood.wf','dood.cx','dood.sh','dood.watch'],
  safelinku:['safelinku.com','sfl.gl','semawur.com','safelink.id','sfl.inc','khaddavi.net'],
  sub2unlock:['sub2unlock.com','sub2unlock.net','sub2unlock.io','sub2unlock.me','sub4unlock.com','sub4unlock.io','sub4unlock.net'],
  rekonise:['rekonise.com'],unshorten:['bit.ly','tinyurl.com','dub.sh','cutt.ly','t.co','shorturl.at']
};
const platformNames = {tiktok:'TikTok',instagram:'Instagram',youtube:'YouTube',facebook:'Facebook',twitter:'X / Twitter',pinterest:'Pinterest',spotify:'Spotify',reddit:'Reddit',threads:'Threads',applemusic:'Apple Music',bilibili:'Bilibili',douyin:'Douyin',rednote:'RedNote',pixiv:'Pixiv',bandcamp:'Bandcamp',terabox:'TeraBox',soundcloud:'SoundCloud',mediafire:'MediaFire',sfile:'Sfile',pixeldrain:'Pixeldrain',catbox:'Catbox',krakenfiles:'Krakenfiles',gdrive:'Google Drive',doodstream:'Doodstream',safelinku:'Safelinku',sub2unlock:'Sub2Unlock',rekonise:'Rekonise',unshorten:'Unshorten'};
// Mirrored from the server-side allowlisted provider registry. The server
// independently validates every selection; these values are display-only.
const scraperProviders = {
  tiktok:['tiktokio','tikdownloader','snaptik','savetik','ssstik'],
  instagram:['indown','snapsave','snapinsta','direct'],
  youtube:['ytmp3gg','ytmp3','playlist'],
  facebook:['snapsave','fdown'],
  twitter:['tvd','savetwt','tweeload','direct'],
  spotify:['spotidown','soundloaders','spotmate','spotisaver'],
  pinterest:['pindown','direct'],bandcamp:['direct','bandcampdownloader'],
  applemusic:['aplmate'],bilibili:['direct'],douyin:['direct'],
  reddit:['rapidsave'],threads:['threadster'],rednote:['direct'],
  pixiv:['ajax'],terabox:['sechno'],soundcloud:['klickaud'],
  mediafire:['mediafire'],sfile:['sfile'],pixeldrain:['pixeldrain'],
  catbox:['catbox'],krakenfiles:['krakenfiles'],gdrive:['gdrive'],
  doodstream:['doodstream'],safelinku:['safelinku'],
  sub2unlock:['sub2unlock'],rekonise:['rekonise'],unshorten:['unshorten']
};
let selectedPlatform = 'all';
let busy = false;
let toastTimer;
const historyKey = 'nexora_downloader_history_v1';

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.hidden = true, 3400);
}
function setFeedback(message, error = false) {
  $('#url-feedback').textContent = message;
  $('#url-feedback').classList.toggle('has-error',error);
  $('#url-field').classList.toggle('field-error',error);
}
function detectPlatform(input) {
  try {
    const hostname = new URL(input.trim()).hostname.toLowerCase();
    return Object.keys(supported).find(key => supported[key].some(host => hostname===host || hostname.endsWith(`.${host}`))) || null;
  } catch { return null; }
}
function refreshScraperProviders() {
  const engine=$('#scraper-engine').value;
  const field=$('#scraper-provider');
  const platform=detectPlatform($('#url-input').value) || (selectedPlatform!=='all'?selectedPlatform:null);
  const previous=field.value;
  field.replaceChildren(make('option','','Auto (disarankan)'));
  field.firstElementChild.value='auto';
  const names=scraperProviders[platform] || [];
  for (const name of names) {
    const option=make('option','',name);
    option.value=name;
    field.append(option);
  }
  field.disabled=engine==='mori' || !platform || !names.length;
  field.value=engine==='mori'?'auto':names.includes(previous)?previous:'auto';
}
function selectPlatform(name, { focus = true } = {}) {
  selectedPlatform = name;
  $$('[data-platform]').forEach(chip => {
    const selected = chip.dataset.platform===name;
    chip.classList.toggle('selected',selected);
    chip.setAttribute('aria-pressed',String(selected));
  });
  const hint = name==='all' ? 'Tempel link dari platform atau host file yang didukung.' : `Silakan tempel link ${platformNames[name] || name} publik.`;
  setFeedback(hint);
  refreshScraperProviders();
  if (focus) $('#url-input').focus({preventScroll:true});
}
function showLoading() {
  const target = $('#result-area'); target.replaceChildren();
  const box=make('div','result-loading');
  const spin=make('div','loader-bubble');spin.append(icon('refresh'));
  const content=make('div');content.append(make('b','', 'Lagi cari medianya...'));
  content.append(make('p','', 'Nexora sedang menghubungi engine sumber. ✨'));
  box.append(spin,content);target.append(box);
}
function showError(message) {
  const target = $('#result-area'); target.replaceChildren();
  const box=make('div','result-error');
  box.append(make('div','error-symbol','!'));
  const content=make('div');content.append(make('b','', 'Oops, belum berhasil!'));
  content.append(make('p','', message));
  const retry=make('button','retry-button','Coba lagi ↗');retry.type='button';
  retry.addEventListener('click',()=>$('#download-form').requestSubmit());
  content.append(retry);box.append(content);target.append(box);
}
function safeHttps(value) {
  try { const url=new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch {return '';}
}
// Download from the current page rather than navigating Chrome Android to a
// JSON/media endpoint (which can show a blank tab before the download prompt).
const MAX_BLOB_DOWNLOAD = 32 * 1024 * 1024;
const activeDownloads = new Set();
function downloadFilename(disposition, fallback) {
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition || '');
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(disposition || '');
  let name = fallback;
  if (encoded) {
    try { name = decodeURIComponent(encoded[1].trim()); } catch {}
  } else if (plain) name = (plain[1] || plain[2] || fallback).trim();
  return String(name).replace(/[\x00-\x1f\x7f\/\\:<>|?*"\r\n]/g, '_').slice(0, 120) || fallback;
}
function isNexoraMediaUrl(value) {
  try {
    const url = new URL(value, location.href);
    return url.origin === location.origin && url.pathname === '/api/media' &&
      url.searchParams.has('token');
  } catch { return false; }
}
// Browser-owned streaming is needed for large files; a hidden same-origin
// iframe keeps the document URL, scroll, and history unchanged.
function streamDownloadInFrame(url) {
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Unduhan Nexora');
  frame.style.display = 'none';
  frame.addEventListener('load', () => {
    // Successful attachments usually do not emit a load event. If an expired
    // token instead returns JSON, display the error rather than a blank page.
    try {
      const content = frame.contentDocument?.body?.textContent || '';
      const data = JSON.parse(content);
      if (data?.error) toast(String(data.error).slice(0, 240));
    } catch { /* A file download is not a readable iframe document. */ }
  });
  document.body.append(frame);
  frame.src = url;
  setTimeout(() => frame.remove(), 120000);
}
async function downloadWithoutNavigation(url, kind, control) {
  if (!isNexoraMediaUrl(url)) {
    toast('Link download tidak valid. Coba analisis ulang.');
    return;
  }
  if (activeDownloads.has(url)) {
    toast('Unduhan ini sedang diproses.');
    return;
  }
  activeDownloads.add(url);
  control?.setAttribute('aria-busy', 'true');
  try {
    // For video, large files and archives, never buffer the entire download
    // into mobile RAM. Keep browser-native streaming within a hidden iframe.
    if (kind !== 'audio' && kind !== 'image') {
      streamDownloadInFrame(url);
      toast('NEXORA menyiapkan unduhan tanpa meninggalkan halaman. ♡');
      return;
    }
    const response = await fetch(url, {cache:'no-store', redirect:'error'});
    if (!response.ok) {
      let message = 'Download gagal. Silakan analisis ulang tautan.';
      try { message = String((await response.json()).error || message); } catch {}
      throw new Error(message);
    }
    const length = Number(response.headers.get('Content-Length') || 0);
    if (length > MAX_BLOB_DOWNLOAD) {
      await response.body?.cancel();
      streamDownloadInFrame(url);
      toast('File besar: browser melanjutkan unduhan tanpa pindah halaman.');
      return;
    }
    const filename = downloadFilename(response.headers.get('Content-Disposition'),
      kind === 'audio' ? 'nexora-audio.mp3' : 'nexora-image.jpg');
    let blob;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BLOB_DOWNLOAD) {
          await reader.cancel();
          streamDownloadInFrame(url);
          toast('File besar: browser melanjutkan unduhan tanpa pindah halaman.');
          return;
        }
        chunks.push(value);
      }
      blob = new Blob(chunks, {type:response.headers.get('Content-Type') || 'application/octet-stream'});
    } else {
      blob = await response.blob();
      if (blob.size > MAX_BLOB_DOWNLOAD) throw new Error('File terlalu besar untuk disimpan dalam memori HP.');
    }
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    toast('Unduhan disiapkan tanpa membuka halaman lain. ♡');
  } catch(error) {
    toast(String(error?.message || 'Gagal mengunduh. Coba analisis ulang.').slice(0, 240));
  } finally {
    control?.removeAttribute('aria-busy');
    activeDownloads.delete(url);
  }
}

// Signed media is streamed through the same-origin Netlify Edge gateway.
// Provider restrictions may still prevent playback or downloading.
function openVideoPreview(downloadUrl, title, posterUrl) {
  const dialog=$('#video-preview-dialog');
  const player=$('#video-preview-player');
  const status=$('#video-preview-status');
  player.pause();
  player.removeAttribute('src');
  player.removeAttribute('poster');
  if (posterUrl) player.poster=posterUrl;
  $('#video-preview-title').textContent=String(title||'Preview video').slice(0,200);
  $('#video-preview-save').href=downloadUrl;
  status.textContent='Memuat preview melalui NEXORA...';
  player.src=downloadUrl + (downloadUrl.includes('?') ? '&' : '?') + 'mode=preview';
  if (!dialog.open) dialog.showModal();
  // A preview click is a user gesture. When autoplay is disallowed, controls
  // remain visible and the visitor can tap Play manually.
  const playing=player.play();
  if(playing && typeof playing.catch==='function') playing.catch(()=>{
    if(!player.error) status.textContent='Tekan Play untuk menonton. Jika tidak bisa diputar, coba Download / Simpan.';
  });
}
function stopVideoPreview() {
  const dialog=$('#video-preview-dialog');
  if(dialog.open) dialog.close();
}

function showResults(data) {
  const target = $('#result-area'); target.replaceChildren();
  const wrap = make('div','result-ready');
  const header = make('div','result-summary');
  const thumb = make('div','result-thumb');
  const thumbUrl=safeHttps(data.thumbnail);
  if (thumbUrl) {const img=make('img');img.alt='Pratinjau media';img.loading='lazy';img.referrerPolicy='no-referrer';img.src=thumbUrl;img.addEventListener('error',()=>img.replaceWith(make('span','', '✦')));thumb.append(img);}
  else thumb.append(make('span','', '✦'));
  const meta=make('div','result-meta');meta.append(make('b','',data.title || 'Media tanpa judul'));
  const ready=(data.options||[]).filter(x=>x.ready).length;
  meta.append(make('p','', `${data.author?data.author+' · ':''}${ready} opsi tersedia`));
  if (data.engineUsed) meta.append(make('p','', `Engine: ${data.engineUsed} · Provider: ${data.providerUsed||'auto'}`));
  header.append(thumb,meta,make('span','result-platform',platformNames[data.platform] || data.platform || 'Media'));
  wrap.append(header);
  const options=make('div','result-options');
  if (!Array.isArray(data.options) || !data.options.length) {
    options.append(make('p','result-note',Array.isArray(data.collectionItems) && data.collectionItems.length
      ? 'Daftar album/playlist ditemukan. Pilih item di bawah untuk menganalisis file.'
      : 'Tidak ada media publik yang berhasil ditemukan oleh engine.'));
  } else {
    data.options.forEach((entry,index) => {
      const item=make('div',`result-option${entry.ready?'':' disabled'}`);
      const kind=['audio','video','image','file','link'].includes(entry.kind)?entry.kind:'video';
      const fmt=make('div',`format-icon ${kind}`);fmt.append(icon(kind==='image'?'image':kind==='audio'?'music':kind==='file'||kind==='link'?'link':'video'));
      const details=make('div','result-format');details.append(make('b','',entry.type || `${kind} ${index+1}`));
      details.append(make('p','',entry.ready?[entry.quality,entry.mirror?'Server alternatif':'',kind==='video'?'Suara tergantung sumber':''].filter(Boolean).join(' · ') || 'Opsi media tersedia' : (entry.reason || 'Tautan tidak tersedia')));
      item.append(fmt,details);
      if (entry.ready) {
        if (kind==='link' && safeHttps(entry.targetUrl)) {
          const action=make('button','download-choice secondary-link','Salin link tujuan');
          action.type='button';
          action.addEventListener('click',async()=>{
            try {await navigator.clipboard.writeText(entry.targetUrl);toast('Link tujuan disalin. Periksa domain sebelum membukanya.');}
            catch {toast('Tidak bisa menyalin otomatis. Gunakan browser untuk menyalin link.');}
          });
          item.append(action);
          details.append(make('p','',`Tujuan: ${entry.targetHost||'domain eksternal'} · Link belum diverifikasi sebagai media`));
        } else if (entry.downloadUrl?.startsWith('/api/media?token=')) {
          const actions=make('div','result-actions');
          if(kind==='video'){
            const preview=make('button','download-choice preview-choice','Preview');
            preview.type='button';
            preview.prepend(icon('play'));
            preview.setAttribute('aria-label','Preview video '+String(entry.type||''));
            preview.addEventListener('click',()=>openVideoPreview(entry.downloadUrl,data.title,thumbUrl));
            actions.append(preview);
          }
          const anchor=make('a','download-choice','Download');
          anchor.href=entry.downloadUrl;
          anchor.download='';
          anchor.append(icon('download'));
          anchor.addEventListener('click',event=>{
            event.preventDefault();
            void downloadWithoutNavigation(entry.downloadUrl,kind,anchor);
          });
          actions.append(anchor);
          item.append(actions);
        } else {
          item.append(make('p','result-note','Link unduhan internal belum tersedia. Silakan analisis ulang.'));
        }
      }
      options.append(item);
    });
  }
  wrap.append(options);
  if (Array.isArray(data.collectionItems) && data.collectionItems.length) {
    const collection=make('div','collection-list');
    collection.append(make('b','','Item dalam album / playlist (maksimal 20):'));
    for (const media of data.collectionItems) {
      const row=make('div','collection-item');
      const title=make('span','',media.title||'Item');
      const analyze=make('button','retry-button','Analisis item ↗');
      analyze.type='button';
      analyze.addEventListener('click',()=>{
        $('#url-input').value=media.url;
        selectPlatform(detectPlatform(media.url)||'all',{focus:false});
        $('#download-form').requestSubmit();
      });
      row.append(title,analyze);collection.append(row);
    }
    wrap.append(collection);
  }
  const notice=make('p','result-note',data.deliveryMode==='edge-proxy'
    ? 'Preview dan Download diproses melalui domain NEXORA. Mode download tidak membuka website provider. Maksimum 120 MB per respons; sumber tertentu mungkin membatasi streaming. Preview dan download menggunakan token yang sama pada limiter sementara 4 video/24 jam per instance Netlify.'
    : 'Download internal belum aktif. Periksa konfigurasi DOWNLOAD_SECRET dan coba analisis ulang.');
  wrap.append(notice);
  if(data.truncated)wrap.append(make('p','result-note','Hanya 12 opsi pertama yang ditampilkan untuk menjaga respons server.'));
  target.append(wrap);
}

function getHistory() {
  try {const data=JSON.parse(localStorage.getItem(historyKey)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.url==='string').slice(0,6):[];}catch{return [];}
}
function saveHistory(url,data) {
  try {const existing=getHistory().filter(x=>x.url!==url);const next=[{url,title:String(data.title||'Media').slice(0,140),platform:data.platform,time:Date.now()},...existing].slice(0,6);localStorage.setItem(historyKey,JSON.stringify(next));}catch{}
  renderHistory();
}
function renderHistory() {
  const history=getHistory();const target=$('#history-list');target.replaceChildren();
  $('#clear-history').disabled=history.length===0;
  if(!history.length){target.append(make('div','history-empty','Belum ada link yang dianalisis. Momen pertamamu menunggu! ✨'));return;}
  for(const item of history){
    const card=make('div','history-item');
    card.append(make('span','history-p',platformNames[item.platform]||'Media'));
    const name=make('span','history-name');name.append(make('b','',item.title));
    let time='Pernah dianalisis';try {time=new Date(item.time).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});}catch{}
    name.append(make('small','',time));card.append(name);
    const reuse=make('button','','Pakai ↗');reuse.type='button';reuse.addEventListener('click',()=>{$('#url-input').value=item.url;selectPlatform(detectPlatform(item.url)||'all');document.getElementById('download').scrollIntoView({behavior:'smooth'});});
    card.append(reuse);target.append(card);
  }
}

// Release the player when the visitor closes the dialog, preventing
// video playback, network usage and memory retention in the background.
const previewDialog=$('#video-preview-dialog');
const previewPlayer=$('#video-preview-player');
$('#video-preview-close').addEventListener('click',stopVideoPreview);
$('#video-preview-done').addEventListener('click',stopVideoPreview);
$('#video-preview-save').addEventListener('click',event=>{
  event.preventDefault();
  void downloadWithoutNavigation($('#video-preview-save').getAttribute('href'),'video',event.currentTarget);
});
previewDialog.addEventListener('click',event=>{if(event.target===previewDialog) stopVideoPreview();});
previewDialog.addEventListener('close',()=>{
  previewPlayer.pause();
  previewPlayer.removeAttribute('src');
  previewPlayer.load();
});
previewPlayer.addEventListener('error',()=>{
  $('#video-preview-status').textContent='Preview tidak bisa diputar dari sumber ini. Coba Download / Simpan, atau analisis ulang bila link sudah kedaluwarsa.';
});
previewPlayer.addEventListener('playing',()=>{
  $('#video-preview-status').textContent='Video diputar melalui NEXORA. ✨';
});

$('#download-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const value=$('#url-input').value.trim();
  if(!value){setFeedback('Tempel tautan terlebih dahulu, ya! ♡',true);$('#url-input').focus();return;}
  let parsed;
  try{parsed=new URL(value);}catch{setFeedback('URL tidak valid. Pastikan dimulai dengan https://',true);return;}
  const detected=detectPlatform(value);
  if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.port){setFeedback('Hanya link HTTPS publik yang diizinkan.',true);return;}
  if(!detected){setFeedback('Domain ini belum didukung oleh Nexora.',true);return;}
  if(selectedPlatform!=='all' && selectedPlatform!==detected){selectPlatform(detected,{focus:false});toast('Platform otomatis disesuaikan dengan link.');}
  busy=true;const button=$('#analyze-btn');button.disabled=true;button.querySelector('span').textContent='Analyzing...';
  setFeedback(`Sedang menganalisis tautan ${platformNames[detected]}...`);showLoading();
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),51000);
  try {
    const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value,engine:$('#scraper-engine').value,provider:$('#scraper-provider').value}),signal:controller.signal,cache:'no-store'});
    const data=await response.json().catch(()=>({error:'Respons server tidak valid.'}));
    if(!response.ok)throw new Error(data.error||`Server mengembalikan status ${response.status}.`);
    showResults(data);saveHistory(value,data);
    setFeedback(`Berhasil memeriksa ${platformNames[detected]}. Pilih salah satu opsi di bawah.`);
  }catch(err){const error=err.name==='AbortError'?'Analisis melewati batas waktu. Coba lagi nanti.':(err.message||'Gagal menghubungi server.');showError(error);setFeedback(error,true);}
  finally{clearTimeout(timeout);busy=false;button.disabled=false;button.querySelector('span').textContent='Analyze Link';}
});

$('#paste-button').addEventListener('click',async()=>{
  try {if(!navigator.clipboard?.readText)throw new Error('Clipboard tidak tersedia');const text=(await navigator.clipboard.readText()).trim();
    if(!text){toast('Clipboard kamu masih kosong.');return;}
    $('#url-input').value=text;
    const detected=detectPlatform(text);selectPlatform(detected && $$('[data-platform]').some(x=>x.dataset.platform===detected)?detected:'all');
    refreshScraperProviders();
    toast('Link berhasil ditempel! ♡');
  }catch{toast('Akses clipboard ditolak. Tempel manual di kolom URL.');$('#url-input').focus();}
});
$('#scraper-engine').addEventListener('change',refreshScraperProviders);
$('#url-input').addEventListener('input',()=>{
  if($('#url-input').value.trim()) {const detected=detectPlatform($('#url-input').value);if(detected && $$('[data-platform]').some(x=>x.dataset.platform===detected)) selectPlatform(detected,{focus:false});else setFeedback('Tips: gunakan link publik yang bisa diakses tanpa login.');}
  else setFeedback('Tips: gunakan link publik yang bisa diakses tanpa login.');
  refreshScraperProviders();
});
$$('[data-platform]').forEach(btn=>{btn.addEventListener('click',()=>selectPlatform(btn.dataset.platform));btn.setAttribute('aria-pressed',String(btn.classList.contains('selected')));});
$('#clear-history').addEventListener('click',()=>{try{localStorage.removeItem(historyKey);}catch{}renderHistory();toast('Riwayat lokal sudah dihapus.');});
$('#mobile-menu-btn').addEventListener('click',()=>{const menu=$('#mobile-nav');const open=menu.hidden;menu.hidden=!open;$('#mobile-menu-btn').setAttribute('aria-expanded',String(open));$('#mobile-menu-btn').replaceChildren(icon(open?'close':'menu'));});
$$('#mobile-nav a').forEach(link=>link.addEventListener('click',()=>{$('#mobile-nav').hidden=true;$('#mobile-menu-btn').setAttribute('aria-expanded','false');$('#mobile-menu-btn').replaceChildren(icon('menu'));}));
$('#year').textContent=String(new Date().getFullYear());refreshScraperProviders();renderHistory();

