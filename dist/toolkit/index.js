
import { z } from "zod";

const DEFAULT_BANNED = ["violence","blood","kill","sex","porn","nude","drug","alcohol","hate","suicide","self-harm","gambling","weapon","gun","extremism"];
function isUnsafe(text, extra=[]){ const t=(text||"").toLowerCase(); const xs = extra.map(s=>String(s).toLowerCase()); for (const w of [...DEFAULT_BANNED, ...xs]) if (t.includes(w)) return {unsafe:true, term:w}; return {unsafe:false}; }
function toJSONSchema(zodSchema){ const shape = zodSchema._def.shape(); const props={}, req=[]; for (const [k,v] of Object.entries(shape)){ const t=v._def.typeName; let s; if(t==="ZodString")s={type:"string"}; else if(t==="ZodNumber")s={type:"number"}; else if(t==="ZodBoolean")s={type:"boolean"}; else if(t==="ZodEnum")s={type:"string", enum:v._def.values}; else if(t==="ZodArray")s={type:"array", items:{type:"string"}}; else s={type:"string"}; props[k]=s; if(!v.isOptional()) req.push(k);} return {type:"object", properties:props, required:req}; }

// --- Utility helpers ---
async function ytSearch(query, max, key){
  const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&safeSearch=strict&maxResults=${Math.min(max,10)}&q=${encodeURIComponent(query)}&key=${key}`;
  const res=await fetch(url); if(!res.ok) return {items:[], error:`YouTube API ${res.status}`}; return await res.json();
}
async function ytCommentsSampling(videoId, openai, model, moderationPrompt){
  const key = process.env.YOUTUBE_API_KEY; if (!key) return { ok:true, reason:"No API key" };
  try {
    const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&maxResults=20&videoId=${encodeURIComponent(videoId)}&key=${key}`;
    const res = await fetch(url); if (!res.ok) return { ok:true, reason:`Comments ${res.status}` };
    const data = await res.json();
    const texts = (data.items||[]).map(it=> it.snippet?.topLevelComment?.snippet?.textDisplay || "").filter(Boolean);
    if (!texts.length) return { ok:true, reason:"No comments" };
    const joined = (" "+texts.join(" ")+" ").toLowerCase();
    const bad = ["violence","kill","blood","hate","sex","adult","drug","self-harm","suicide","challenge","prank","terror","gun"];
    if (bad.some(w => joined.includes(w))) return { ok:false, reason:"Keyword screen failed" };
    if (openai){
      const sys = moderationPrompt || `You are a Comments Safety Moderator for children ages 7–12.
If any comments include hate, harassment, adult content, graphic violence, self-harm encouragement, dangerous challenges, or strong profanity, reply: REJECT_UNSAFE_COMMENTS. Otherwise reply: OK.`;
      const resp = await openai.chat.completions.create({ model: model || "gpt-4.1-mini", temperature:0.0, messages: [ {role:"system", content: sys}, {role:"user", content: texts.join("\n---\n").slice(0,6000)} ] });
      const msg = (resp.choices?.[0]?.message?.content || "").trim();
      if (msg === "REJECT_UNSAFE_COMMENTS") return { ok:false, reason:"Moderator rejected" };
    }
    return { ok:true, reason:"Passed" };
  } catch (e) { return { ok:true, reason:"Comments error: "+String(e) }; }
}
function makeEmbedHtml(videoId, title, {autoplay=false}={}){
  const qp = autoplay ? "1" : "0";
  const src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&controls=1&iv_load_policy=3&autoplay=${qp}`;
  const esc = (s)=> String(s||"Safe Video").replace(/"/g,"&quot;");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; img-src 'self' data: https:; media-src https:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none';"><title>${esc(title)}</title></head><body style="margin:0;background:#000"><div style="position:fixed;inset:0"><iframe title="${esc(title)}" src="${src}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" sandbox="allow-scripts allow-same-origin" style="width:100%;height:100%"></iframe></div></body></html>`;
}
function makeGalleryHtml(images, caption){
  const items = images.map((im,i)=>`<figure class="g-item"><img src="${im.src}" alt="Image ${i+1}" referrerpolicy="no-referrer" draggable="false"/><figcaption>${(im.title||"")}</figcaption></figure>`).join("");
  const safeCap = (caption||"").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; img-src 'self' data: https:; media-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none';"><title>Gallery</title></head>
<body style="margin:0;background:#fff">
  <div style="position:fixed;inset:0;display:flex;flex-direction:column;overflow:hidden">
    <div style="padding:12px 16px;font-weight:700">${safeCap}</div>
    <div style="flex:1;overflow:auto;padding:12px;display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">${items}</div>
  </div>
</body></html>`;
}

// --- safeSearch ---
const safeSearchSchema = z.object({ query: z.string(), bannedExtra: z.array(z.string()).optional(), limit: z.number().optional().default(5), googleCseId: z.string().optional(), googleApiKey: z.string().optional() });
export async function safeSearch(args, ctx){
  const { query, bannedExtra=[], limit, googleCseId, googleApiKey } = safeSearchSchema.parse(args);
  const mergedBanned = [...bannedExtra, ...(((ctx.policy||{}).bannedTerms)||[])];
  const { unsafe, term } = isUnsafe(query, mergedBanned); if (unsafe) return { safe:false, reason:`Query flagged as unsafe ("${term}")`, action:"REDIRECT" };
  const CSE = googleCseId || process.env.GOOGLE_CSE_ID; const KEY = googleApiKey || process.env.GOOGLE_API_KEY;
  if (!CSE || !KEY) return { safe:false, reason:"Search provider not configured.", action:"ASK_ALTERNATIVE" };
  const url = `https://www.googleapis.com/customsearch/v1?key=${KEY}&cx=${CSE}&q=${encodeURIComponent(query)}&num=${Math.min(limit,10)}`;
  const res = await fetch(url); if (!res.ok) return { safe:false, reason:`Provider error ${res.status}` };
  const data = await res.json(); const docs = (data.items||[]).map(it=>({ title: it.title, snippet: it.snippet }));

  const curatorSystem = (ctx.prompts && ctx.prompts.curatorPrompt) ? ctx.prompts.curatorPrompt : `You are a Safety Curator AI. Summarize the following search snippets...`;
  const resp = await ctx.openai.chat.completions.create({ model: ctx.model || "gpt-4.1-mini", temperature:0.2, messages: [ {role:"system", content: curatorSystem}, {role:"user", content: JSON.stringify(docs).slice(0,8000)} ] });
  const msg = (resp.choices?.[0]?.message?.content || "").trim();
  if (msg === "REJECT_UNSAFE_RESULTS") return { safe:false, reason:"Curator rejected as unsafe", action:"REDIRECT" };
  return { safe:true, summary: msg };
}

// --- safeYouTubeSearch ---
const ytSchema = z.object({ query: z.string(), bannedExtra: z.array(z.string()).optional(), max: z.number().optional().default(3), allowlist: z.array(z.object({id:z.string(), title:z.string().optional(), channel:z.string().optional(), tags:z.array(z.string()).optional()})).optional(), allowlistPath: z.string().optional(), requireAllowlist: z.boolean().optional().default(false), autoplay: z.boolean().optional().default(false) });
export async function safeYouTubeSearch(args, ctx){
  const { query, bannedExtra=[], max, allowlist, allowlistPath, requireAllowlist=false, autoplay=false } = ytSchema.parse(args);
  const mergedBanned = [...bannedExtra, ...(((ctx.policy||{}).bannedTerms)||[])];
  const { unsafe, term } = isUnsafe(query, mergedBanned); if (unsafe) return { safe:false, reason:`Query flagged as unsafe ("${term}")`, action:"REDIRECT" };
  let allow = allowlist || [];
  if (!allow.length && allowlistPath){
    try { const txt = await (await import("node:fs/promises")).readFile(allowlistPath, "utf8"); const data = JSON.parse(txt); allow = data.videos || []; } catch {}
  }
  let candidates = [];
  if (allow.length){
    const q = query.toLowerCase();
    const matched = allow.filter(v => (v.title||"").toLowerCase().includes(q) || (v.tags||[]).some(t => q.includes(String(t).toLowerCase())));
    candidates.push(...matched.map(v => ({ id: v.id, title: v.title||"Safe Video", channel: v.channel||"" })));
  }
  if (requireAllowlist && !candidates.length) return { safe:false, reason:"No allowlisted videos matched.", action:"ASK_ALTERNATIVE" };

  if (!requireAllowlist){
    const KEY = process.env.YOUTUBE_API_KEY;
    if (KEY){
      const data = await ytSearch(query, max, KEY);
      const items = (data.items||[]).map(it => ({ id: it.id?.videoId, title: it.snippet?.title||"Safe Video", channel: it.snippet?.channelTitle||"" }))
        .filter(v => v.id && !/live/i.test(v.title||"") && !/(prank|scare|horror|kill|blood|gun)/i.test((v.title||"")+" "+(v.channel||"")));
      candidates.push(...items);
    }
  }
  const seen = new Set(); const shortlist=[];
  for (const v of candidates){ if (!v.id || seen.has(v.id)) continue; seen.add(v.id); shortlist.push(v); if (shortlist.length>=max*2) break; }
  if (!shortlist.length) return { safe:false, reason:"No safe videos found.", action:"ASK_ALTERNATIVE" };

  let chosen = null;
  const moderationPrompt = (ctx.prompts && ctx.prompts.commentsModerationPrompt) ? ctx.prompts.commentsModerationPrompt : undefined;
  for (const cand of shortlist){
    const pass = await ytCommentsSampling(cand.id, ctx.openai, ctx.model, moderationPrompt);
    if (pass.ok){ chosen = cand; break; }
  }
  if (!chosen) return { safe:false, reason:"All candidates failed comments moderation.", action:"ASK_ALTERNATIVE" };

  const embedHtml = makeEmbedHtml(chosen.id, chosen.title, { autoplay });
  return { safe:true, video: chosen, embedHtml };
}

// --- safeImageGallery ---
import { z as zimg } from "zod";
const gallerySchema = zimg.object({ query: zimg.string(), max: zimg.number().optional().default(12), mode: zimg.enum(["url","dataURI"]).optional().default("dataURI") });
async function cseImageSearch(query, limit, policy){
  const CSE = process.env.GOOGLE_CSE_ID, KEY = process.env.GOOGLE_API_KEY;
  if (!CSE || !KEY) return { items: [], error: "Search provider not configured." };
  const url = `https://www.googleapis.com/customsearch/v1?searchType=image&safe=active&key=${KEY}&cx=${CSE}&q=${encodeURIComponent(query)}&num=${Math.min(limit,10)}`;
  const res = await fetch(url);
  if (!res.ok) return { items: [], error: `CSE image error ${res.status}` };
  const data = await res.json();
  const allow = (policy && Array.isArray(policy.allowDomains) && policy.allowDomains.length) ? policy.allowDomains.map(d=>String(d).toLowerCase()) : null;
  const items = (data.items||[]).map(it=>{
    let host=""; try{ host=new URL(it.link).hostname.toLowerCase(); }catch{}
    return { url: it.link, title: it.title || it.snippet || "Image", host, mime: it.mime };
  }).filter(it => !allow || allow.some(d => it.host===d || it.host.endsWith("."+d)));
  return { items };
}
function friendlyFilter(img){
  const t = (img.title||"").toLowerCase();
  const bad = ["blood","kill","scare","horror","weapon","gun","adult","violence","injury","gore"];
  return !bad.some(w => t.includes(w));
}
export async function safeImageGallery(args, ctx){
  const { query, max, mode } = gallerySchema.parse(args);
  const mergedBanned = [...(((ctx.policy||{}).bannedTerms)||[])];
  const { unsafe, term } = isUnsafe(query, mergedBanned); if (unsafe) return { safe:false, reason:`Query flagged as unsafe ("${term}")`, action:"REDIRECT" };
  const res = await cseImageSearch(query, max, ctx.policy);
  if (res.error) return { safe:false, reason:res.error, action:"ASK_ALTERNATIVE" };
  const filtered = res.items.filter(friendlyFilter).slice(0, max);
  if (!filtered.length) return { safe:false, reason:"No safe images found.", action:"ASK_ALTERNATIVE" };

  const images = [];
  if (mode === "dataURI"){
    for (const it of filtered){
      try {
        const r = await fetch(it.url); if (!r.ok) continue;
        const b = await r.arrayBuffer();
        const base64 = Buffer.from(b).toString("base64");
        const mime = it.mime || "image/jpeg";
        images.push({ src: `data:${mime};base64,${base64}`, title: it.title, host: it.host });
      } catch {}
      if (images.length >= max) break;
    }
  } else {
    for (const it of filtered){
      images.push({ src: it.url, title: it.title, host: it.host });
      if (images.length >= max) break;
    }
  }

  let caption = "";
  try {
    const prompt = (ctx.prompts && ctx.prompts.galleryPrompt) ? ctx.prompts.galleryPrompt : `You are a kid-safe image curator. Write 1–2 simple sentences describing the gallery.`;
    const reply = await ctx.openai.chat.completions.create({
      model: ctx.model || "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        { role:"system", content: prompt },
        { role:"user", content: `Query: ${query}\nTitles: ${images.map(i=>i.title).slice(0,8).join("; ")}` }
      ]
    });
    caption = (reply.choices?.[0]?.message?.content || "").trim();
  } catch {}

  const galleryHtml = makeGalleryHtml(images, caption);
  return { safe:true, images: images.map((i,idx)=>({ index: idx+1, domain: i.host, title: i.title })), galleryHtml };
}

// --- openSafeUrl ---
const openUrlSchema = z.object({ url: z.string(), allowDomains: z.array(z.string()).optional(), title: z.string().optional() });
export async function openSafeUrl(args, ctx){
  const { url, allowDomains=["www.youtube.com","youtube.com","youtu.be"], title="Safe Content" } = openUrlSchema.parse(args);
  const mergedDomains = Array.from(new Set([...(allowDomains||[]), ...(((ctx.policy||{}).allowDomains)||[])]));
  let host=""; try{ host=new URL(url).hostname.toLowerCase(); }catch{}
  const ok = mergedDomains.some(d => host===d || host.endsWith("."+d));
  if (!ok) return { safe:false, reason:`Domain not allowed: ${host}` };
  let id=null; try { const u=new URL(url); if (u.hostname==="youtu.be") id=u.pathname.slice(1); if(u.pathname==="/watch") id=u.searchParams.get("v"); } catch {}
  if (!id) return { safe:false, reason:"Only YouTube links supported here.", action:"USE_SAFE_YOUTUBE_SEARCH" };
  const embedHtml = makeEmbedHtml(id, title, { autoplay:false });
  return { safe:true, videoId:id, embedHtml };
}

// --- creativeHelper ---
const creativeSchema = z.object({ prompt: z.string().optional(), age: z.enum(["child_4-6","child_7-12","teen_13-15"]).optional() });
export async function creativeHelper(args, ctx){
  const { prompt="Write a short, cheerful 4-line poem about rainbows.", age="child_7-12" } = creativeSchema.parse(args);
  const sys = `You are a friendly creative helper for kids (${age}). Keep it simple, kind, and safe. 3-6 short lines. Avoid scary or adult topics.`;
  const res = await ctx.openai.chat.completions.create({ model: ctx.model || "gpt-4.1-mini", temperature:0.7, messages: [ {role:"system", content: sys}, {role:"user", content: prompt} ] });
  const text = res.choices?.[0]?.message?.content || "";
  return { text };
}

// --- perplexSearch ---
import { z as z2 } from "zod";
const perplexSchema = z2.object({ query: z2.string(), maxResults: z2.number().optional().default(6), maxTokensPerPage: z2.number().optional().default(2000) });
async function webSearchCSE(query, limit, policy){
  const CSE = process.env.GOOGLE_CSE_ID, KEY = process.env.GOOGLE_API_KEY;
  if (!CSE || !KEY) return { items: [], error: "Search provider not configured." };
  const url = `https://www.googleapis.com/customsearch/v1?key=${KEY}&cx=${CSE}&q=${encodeURIComponent(query)}&num=${Math.min(limit,10)}`;
  const res = await fetch(url);
  if (!res.ok) return { items: [], error: `CSE error ${res.status}` };
  const data = await res.json();
  const allow = (policy && Array.isArray(policy.allowDomains) && policy.allowDomains.length) ? policy.allowDomains.map(d=>String(d).toLowerCase()) : null;
  const items = (data.items||[]).map(it=>{
    let host=""; try{ host=new URL(it.link).hostname.toLowerCase(); }catch{}
    return { url: it.link, title: it.title, snippet: it.snippet, host };
  }).filter(it => !allow || allow.some(d => it.host===d || it.host.endsWith("."+d)));
  return { items };
}
function stripTags(html){ return String(html||"").replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," "); }
function trimLen(s, n){ s = String(s||""); if (s.length<=n) return s; return s.slice(0, n-3)+"..."; }
export async function perplexSearch(args, ctx){
  const { query, maxResults, maxTokensPerPage } = perplexSchema.parse(args);
  const mergedBanned = [ ...(((ctx.policy||{}).bannedTerms)||[]) ];
  const { unsafe, term } = isUnsafe(query, mergedBanned);
  if (unsafe) return { safe:false, reason:`Query flagged as unsafe ("${term}")`, action:"REDIRECT" };

  const search = await webSearchCSE(query, maxResults, ctx.policy);
  if (search.error) return { safe:false, reason:search.error, action:"ASK_ALTERNATIVE" };
  if (!search.items.length) return { safe:false, reason:"No allowlisted sources found.", action:"ASK_ALTERNATIVE" };

  const pages = [];
  for (const it of search.items.slice(0, Math.min(6, maxResults))){
    try {
      const res = await fetch(it.url, { redirect: "follow" });
      if (!res.ok) continue;
      const html = await res.text();
      const text = stripTags(html).replace(/\s+/g," ").trim();
      pages.push({ host: it.host, title: trimLen(it.title, 120), url: it.url, text: trimLen(text, maxTokensPerPage) });
    } catch {}
  }
  if (!pages.length) return { safe:false, reason:"No readable pages available.", action:"ASK_ALTERNATIVE" };

  const sys = (ctx.prompts && (ctx.prompts.perplexSearchPrompt || ctx.prompts.curatorPrompt)) ? (ctx.prompts.perplexSearchPrompt || ctx.prompts.curatorPrompt) :
`You are a child-safe Perplexity-style writer. Write 4–7 simple sentences for ages 7–12.
Use numbered citations like [1], [2] referring to the provided sources array (by index starting at 1).
Avoid URLs or brands in the text. Be factual, calm, and kind.`;

  const payload = {
    query,
    sources: pages.slice(0,3).map((p, i)=>({ id: i+1, host: p.host, title: p.title, excerpt: p.text.slice(0, 500) }))
  };

  const completion = await ctx.openai.chat.completions.create({
    model: ctx.model || "gpt-4.1-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: JSON.stringify(payload).slice(0, 8000) }
    ]
  });
  const answer = (completion.choices?.[0]?.message?.content || "").trim();

  const result = {
    safe: true,
    answer,
    sources: payload.sources.map(s => ({ index: s.id, domain: s.host, title: s.title }))
  };
  return result;
}

// --- registry ---
const builtins = {
  safeSearch: { schema: safeSearchSchema, impl: safeSearch, desc:"Child-safe web search with Curator summary." },
  safeYouTubeSearch: { schema: ytSchema, impl: safeYouTubeSearch, desc:"Kid-safe YouTube with comments sampling and sandboxed embed." },
  openSafeUrl: { schema: openUrlSchema, impl: openSafeUrl, desc:"Open allowlisted URLs via sandboxed embed." },
  creativeHelper: { schema: creativeSchema, impl: creativeHelper, desc:"Child-friendly creative helper." },
  safeImageGallery: { schema: gallerySchema, impl: safeImageGallery, desc:"Kid-safe image search and modal gallery." },
  perplexSearch: { schema: perplexSchema, impl: perplexSearch, desc:"Child-safe Perplexity-like search summarizer." }
};
export function toOpenAITools(toolsFile){
  const entries = Object.entries(builtins);
  let specs = entries.map(([name,def])=>({ type:"function", function:{ name, description:def.desc, parameters: toJSONSchema(def.schema) } }));
  let impls = Object.fromEntries(entries.map(([k,v])=>[k,v.impl]));
  if (toolsFile){
    let req=[];
    if (Array.isArray(toolsFile)) req = toolsFile.map(x=> typeof x==="string" ? x : x.name).filter(Boolean);
    else if (toolsFile.tools){ if (Array.isArray(toolsFile.tools)) req = toolsFile.tools.map(x=> typeof x==="string"?x:x.name).filter(Boolean); else if (toolsFile.tools.tool){ const t=toolsFile.tools.tool; req = Array.isArray(t)? t.map(v=> v.$?.name||v.name) : [t.$?.name||t.name]; }}
    if (req.length){ specs = req.filter(n=>builtins[n]).map(n=>({ type:"function", function:{ name:n, description: builtins[n].desc, parameters: toJSONSchema(builtins[n].schema) } })); impls = {}; for (const n of req) if (builtins[n]) impls[n]=builtins[n].impl; }
  }
  return { specs, impls };
}
