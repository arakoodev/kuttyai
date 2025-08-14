import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as toolkit from '../src/toolkit/index.js'

const okJson = (obj) => ({ ok: true, json: async () => obj })
const okBin = (bytes=16) => ({ ok: true, arrayBuffer: async () => new Uint8Array(Array.from({length: bytes}, (_,i)=>i%255)).buffer })

describe('safeImageGallery defaults to dataURI with allowlist', () => {
  const ORIG = global.fetch
  beforeEach(() => {
    global.fetch = vi.fn(async (url) => {
      const u = String(url)
      if (u.includes('customsearch') && u.includes('searchType=image')) {
        return okJson({ items: [
          { link: 'https://images.nasa.gov/r1.jpg', title: 'Rainbow kid art', mime:'image/jpeg' },
          { link: 'https://images.nasa.gov/r2.png', title: 'Rainbow drawing', mime:'image/png' }
        ] })
      }
      if (u.startsWith('https://images.nasa.gov/')) return okBin(32)
      return { ok:false, status:404, text: async ()=> 'not found' }
    })
  })
  afterEach(()=>{ global.fetch = ORIG })
  it('returns galleryHtml with data: URIs', async () => {
    const ctx = { policy: { allowDomains: ['images.nasa.gov'], bannedTerms: [] }, openai: null, model: 'test', prompts: {} }
    const out = await toolkit.safeImageGallery({ query: 'rainbows for kids' }, ctx)
    expect(out.safe).toBe(true)
    expect(typeof out.galleryHtml).toBe('string')
    expect(out.galleryHtml.includes('src="data:')).toBe(true)
  })
})
