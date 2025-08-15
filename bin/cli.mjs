import fs from 'node:fs'
import path from 'node:path'
import { runPerplexSearch } from '../src/index.js'
import { safeImageGallery, safeYouTubeSearch, openSafeUrl, reviewYouTubeSafety } from '../src/toolkit/index.js'
import { loadPrompts } from '../src/prompts.js'
import { openInElectron } from '../viewer/launch.js'
import OpenAI from 'openai'

function parseArgs(args){
  const out = {}
  for (let i=0;i<args.length;i++){
    const a = args[i]
    if (a.startsWith('--')){
      const k = a.slice(2)
      const v = args[i+1]
      if (v && !v.startsWith('--')){ out[k]=v; i++ }
      else out[k]=true
    } else {
      if (!out._) out._=[]
      out._.push(a)
    }
  }
  return out
}

function loadJson(p){
  try { return JSON.parse(fs.readFileSync(path.resolve(p),'utf8')) } catch { return {} }
}

function buildPolicy(domainsPath, bannedPath){
  const domains = domainsPath ? loadJson(domainsPath).domains || [] : []
  const banned = bannedPath ? loadJson(bannedPath).banned || [] : []
  return { allowDomains: domains, bannedTerms: banned }
}

export async function main(argv){
  const [,, cmd, ...rest] = argv
  const opts = parseArgs(rest)
  const policy = buildPolicy(opts.domains, opts.banned)
  const keys = { googleKey: process.env.GOOGLE_API_KEY, googleCx: process.env.GOOGLE_CSE_ID }

  const openai = process.env.OPENAI_API_KEY && process.env.KUTTYAI_TEST_MOCK!=='1'
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : { chat:{ completions:{ create: async ()=>({ choices:[{ message:{ content:'' } }] }) } } }

  const prompts = await loadPrompts(opts.prompts)
  const ctx = { policy, keys, openai, model: process.env.KUTTYAI_MODEL || 'gpt-4o-mini', prompts }

  const shouldView = opts.view || (!opts.noView && !process.env.CI)

  if (cmd === 'perplexsearch'){
    const res = await runPerplexSearch({ query: opts.input || '', policy, keys, openai, model: ctx.model, topK: opts.topK?Number(opts.topK):6, prompts })
    if (!res.safe){ console.error(res.reason || 'unsafe'); process.exitCode = 1; return }
    console.log('Answer:', res.answer)
    console.log('Sources:')
    for (const s of res.sources) console.log('-', s.link)
    if (res.review) console.log('Safety:', res.review.decision)
    if (shouldView){
      const html = makePerplexHtml(res.answer, res.sources)
      if (!openInElectron(html, policy, 'perplexsearch')) {
        console.error('Failed to launch Electron viewer')
      }
    }
  } else if (cmd === 'gallery'){
    const res = await safeImageGallery({ query: opts.input || '' }, ctx)
    if (!res.safe){ console.error(res.reason || 'unsafe'); process.exitCode = 1; return }
    console.log('Gallery images:')
    for (const im of res.images) console.log('-', im.url)
    if (shouldView && res.galleryHtml) {
      if (!openInElectron(res.galleryHtml, policy, 'gallery')) {
        console.error('Failed to launch Electron viewer')
      }
    }
  } else if (cmd === 'youtube'){
    const res = await safeYouTubeSearch({ query: opts.input || '' }, ctx)
    if (!res.safe){ console.error(res.reason || 'unsafe'); process.exitCode = 1; return }
    const review = await reviewYouTubeSafety(res.video, ctx)
    if (!review.safe){ console.error(review.reason || 'unsafe'); process.exitCode = 1; return }
    console.log('Video:', res.video.url)
    console.log('Safety:', review.decision)
    if (shouldView){
      const open = await openSafeUrl({ url: res.video.url }, ctx)
      if (open.safe && !openInElectron(open.embedHtml, policy, 'youtube')) {
        console.error('Failed to launch Electron viewer')
      }
    }
  } else {
    console.error('Unknown command')
    process.exitCode = 1
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]))
}

function makePerplexHtml(answer, sources){
  const srcList = sources.map(s=>`<li><a href="${escapeHtml(s.link)}">${escapeHtml(s.title||s.link)}</a></li>`).join('')
  return `<!doctype html><html><body><div class="answer">${escapeHtml(answer)}</div><ul>${srcList}</ul></body></html>`
}

