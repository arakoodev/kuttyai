import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { OpenAI } from 'openai'
import { runPerplexSearch } from '../src/index.js'
import { safeYouTubeSearch, safeImageGallery } from '../src/toolkit/index.js'

function parseArgs(argv){
  const args = []
  const opts = {}
  let cmd = null
  for (let i=2; i<argv.length; i++){
    const a = argv[i]
    if (!cmd) { cmd = a; continue }
    if (a.startsWith('--')) {
      const k = a.slice(2)
      const v = (i+1<argv.length && !argv[i+1].startsWith('--')) ? argv[++i] : true
      opts[k] = v
    } else {
      args.push(a)
    }
  }
  return { cmd, args, opts }
}

function readJsonMaybe(p){
  if (!p) return null
  try { return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')) } catch { return null }
}

async function cmdPerplex(opts){
  const domainsJson = readJsonMaybe(opts.domains)
  const bannedJson = readJsonMaybe(opts.banned)
  const policy = { allowDomains: domainsJson?.domains || [], bannedTerms: bannedJson?.banned || [] }
  if (!policy.allowDomains.length){
    console.error('Error: allowlist required. Provide --domains with a non-empty {"domains": [...]} list.')
    process.exitCode = 2; return
  }
  const input = String(opts.input || '').trim()
  if (!input){ console.error('Error: --input "<question>" is required'); process.exitCode=2; return }
  const model = process.env.KUTTYAI_MODEL || 'gpt-4.1-mini'
  let client = null
  if (process.env.KUTTYAI_TEST_MOCK==='1'){
    // no OpenAI client needed
  } else {
    const openaiKey = process.env.OPENAI_API_KEY
    const googleKey = process.env.GOOGLE_API_KEY
    const googleCx = process.env.GOOGLE_CSE_ID
    if (!googleKey || !googleCx){ console.error('Error: GOOGLE_API_KEY and GOOGLE_CSE_ID are required for web search.'); process.exitCode=2; return }
    if (!openaiKey){ console.error('Error: OPENAI_API_KEY is required for answer generation.'); process.exitCode=2; return }
    client = new OpenAI({ apiKey: openaiKey })
  }
  const keys = (process.env.KUTTYAI_TEST_MOCK==='1') ? {} : { googleKey: process.env.GOOGLE_API_KEY, googleCx: process.env.GOOGLE_CSE_ID }
  const out = await runPerplexSearch({ query: input, policy, keys, openai: client, model, topK: Number(opts.topK || 6) })
  if (!out.safe){ console.error('Error:', out.error || 'unknown'); process.exitCode=2; return }
  if (out.answer) console.log(out.answer.trim())
  if (Array.isArray(out.sources) && out.sources.length){
    console.log('\nSources:')
    for (let i=0;i<out.sources.length;i++){
      const s = out.sources[i]
      console.log(`[${i+1}] ${s.title} - ${s.displayLink}`)
      console.log(`    ${s.link}`)
    }
  }
}

async function cmdYouTube(opts){
  const domainsJson = readJsonMaybe(opts.domains)
  const bannedJson = readJsonMaybe(opts.banned)
  const policy = { allowDomains: domainsJson?.domains || [], bannedTerms: bannedJson?.banned || [] }
  if (!policy.allowDomains.length){ console.error('Error: allowlist required. Provide --domains'); process.exitCode=2; return }
  const input = String(opts.input || '').trim()
  if (!input){ console.error('Error: --input "<query>" is required'); process.exitCode=2; return }
  const ctx = { policy, openai: null, model:'test', prompts:{}, keys:{} }
  const out = await safeYouTubeSearch({ query: input }, ctx)
  if (!out.safe){ console.error('Error:', out.reason || 'youtube_failed'); process.exitCode=2; return }
  console.log(`Video: ${out.video.title}`)
  console.log(`${out.video.url}`)
}

async function cmdGallery(opts){
  const domainsJson = readJsonMaybe(opts.domains)
  const bannedJson = readJsonMaybe(opts.banned)
  const policy = { allowDomains: domainsJson?.domains || [], bannedTerms: bannedJson?.banned || [] }
  if (!policy.allowDomains.length){ console.error('Error: allowlist required. Provide --domains'); process.exitCode=2; return }
  const input = String(opts.input || '').trim()
  if (!input){ console.error('Error: --input "<query>" is required'); process.exitCode=2; return }
  const ctx = { policy, openai: null, model:'test', prompts:{}, keys: { googleKey: process.env.GOOGLE_API_KEY, googleCx: process.env.GOOGLE_CSE_ID } }
  const out = await safeImageGallery({ query: input, max: 4 }, ctx)
  if (!out.safe){ console.error('Error:', out.reason || 'gallery_failed'); process.exitCode=2; return }
  console.log('Gallery images:')
  for (const img of out.images){
    const u = img.url || img.src || ''
    console.log(`- ${img.title} — ${u}`)
  }
}

export async function main(argv){
  const { cmd, opts } = parseArgs(argv)
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h'){
    console.log('Usage: kuttyai <perplexsearch|youtube|gallery> --input "..." --domains ./domains.json [--banned ./banned.json]')
    return
  }
  if (cmd==='perplexsearch') return cmdPerplex(opts)
  if (cmd==='youtube') return cmdYouTube(opts)
  if (cmd==='gallery') return cmdGallery(opts)
  console.error(`Unknown command: ${cmd}`); process.exitCode=2
}
