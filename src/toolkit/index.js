import { Buffer } from 'node:buffer';

const DEFAULT_BANNED = ['violence','blood','kill','sex','porn','nude','drug','alcohol','hate','suicide','self-harm','gambling','weapon','gun','extremism'];
function isUnsafe(text, extra=[]) {
  const t = String(text||'').toLowerCase();
  for (const w of [...DEFAULT_BANNED, ...extra.map(s=>String(s).toLowerCase())]) {
    if (t.includes(w)) return { unsafe: true, term: w };
  }
  return { unsafe: false };
}

export async function safeSearch(args, ctx){
  if (!ctx?.policy?.allowDomains?.length) return { safe:false, reason:'Allowlist required (provide --domains)', action:'ASK_ALTERNATIVE' };
  return { safe:false, reason:'Not implemented in tests' };
}

export async function safeYouTubeSearch(args, ctx){
  if (!ctx?.policy?.allowDomains?.length) return { safe:false, reason:'Allowlist required (provide --domains)', action:'ASK_ALTERNATIVE' };
  return { safe:false, reason:'Not implemented in tests' };
}

export async function perplexSearch(args, ctx){
  if (!ctx?.policy?.allowDomains?.length) return { safe:false, reason:'Allowlist required (provide --domains)', action:'ASK_ALTERNATIVE' };
  return { safe:false, reason:'Not implemented in tests' };
}

function makeEmbedHtml(videoId, title='Safe Video'){
  const src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&controls=1`;
  return `<!doctype html><html><body><iframe src="${src}" sandbox="allow-scripts allow-same-origin" style="width:100%;height:100%"></iframe></body></html>`;
}

export async function openSafeUrl(args, ctx){
  if (!ctx?.policy?.allowDomains?.length) return { safe:false, reason:'Allowlist required (provide --domains)', action:'ASK_ALTERNATIVE' };
  const url = new URL(args.url);
  const host = (url.hostname||'').toLowerCase();
  const allow = ctx.policy.allowDomains.map(d=>String(d).toLowerCase());
  const ok = allow.some(d => host===d || host.endsWith('.'+d));
  if (!ok) return { safe:false, reason:`Domain not allowed: ${host}` };
  let id = null;
  if (host==='youtu.be') id = url.pathname.slice(1);
  if (!id && url.pathname==='/watch') id = url.searchParams.get('v');
  if (!id) return { safe:false, reason:'Only YouTube links supported here.' };
  return { safe:true, videoId:id, embedHtml: makeEmbedHtml(id) };
}

function makeGalleryHtml(images, caption=''){
  const items = images.map((im,i)=>`<figure><img src="${im.src}" alt="Image ${i+1}" referrerpolicy="no-referrer" draggable="false"/></figure>`).join('');
  return `<!doctype html><html><body>${caption}${items}</body></html>`;
}

export async function safeImageGallery(args, ctx){
  if (!ctx?.policy?.allowDomains?.length) return { safe:false, reason:'Allowlist required (provide --domains)', action:'ASK_ALTERNATIVE' };
  const mode = (args && args.mode) || 'dataURI';
  const max = Math.min((args && args.max) || 12, 12);
  const q = String(args?.query || '');
  const CSE = 'mock';
  const KEY = 'mock';
  const url = `https://www.googleapis.com/customsearch/v1?searchType=image&safe=active&key=${KEY}&cx=${CSE}&q=${encodeURIComponent(q)}&num=${Math.min(max,10)}`;
  const res = await fetch(url);
  if (!res.ok) return { safe:false, reason:'Search provider not configured' };
  const data = await res.json();
  const allow = ctx.policy.allowDomains.map(d=>String(d).toLowerCase());
  const items = (data.items||[]).map(it=>{
    let host = '';
    try { host = new URL(it.link).hostname.toLowerCase(); } catch {}
    return { url: it.link, title: it.title || 'Image', host, mime: it.mime || 'image/jpeg' };
  }).filter(it => allow.some(d => it.host===d || it.host.endsWith('.'+d))).slice(0,max);
  const images = [];
  if (mode === 'dataURI'){
    for (const it of items){
      const r = await fetch(it.url);
      if (!r.ok) continue;
      const b = Buffer.from(await r.arrayBuffer());
      const dataUri = `data:${it.mime};base64,${b.toString('base64')}`;
      images.push({ src: dataUri, title: it.title, host: it.host });
    }
  } else {
    for (const it of items) images.push({ src: it.url, title: it.title, host: it.host });
  }
  if (!images.length) return { safe:false, reason:'No safe images found', action:'ASK_ALTERNATIVE' };
  const html = makeGalleryHtml(images, '');
  return { safe:true, images: images.map((i,idx)=>({ index: idx+1, domain: i.host, title: i.title })), galleryHtml: html };
}
