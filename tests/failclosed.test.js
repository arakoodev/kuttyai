import { describe, it, expect } from 'vitest'
import * as toolkit from '../src/toolkit/index.js'

const ctxNoDomains = { policy: { allowDomains: [], bannedTerms: [] }, openai: null, model: 'test', prompts: {} }

describe('fail-closed default when no --domains provided', () => {
  it('safeSearch refuses without allowlist', async () => {
    const out = await toolkit.safeSearch({ query: 'test' }, ctxNoDomains)
    expect(out.safe).toBe(false)
  })
  it('safeYouTubeSearch refuses without allowlist', async () => {
    const out = await toolkit.safeYouTubeSearch({ query: 'test video' }, ctxNoDomains)
    expect(out.safe).toBe(false)
  })
  it('safeImageGallery refuses without allowlist', async () => {
    const out = await toolkit.safeImageGallery({ query: 'cats' }, ctxNoDomains)
    expect(out.safe).toBe(false)
  })
  it('perplexSearch refuses without allowlist', async () => {
    const out = await toolkit.perplexSearch({ query: 'why rain' }, ctxNoDomains)
    expect(out.safe).toBe(false)
  })
  it('openSafeUrl refuses without allowlist', async () => {
    const out = await toolkit.openSafeUrl({ url: 'https://youtu.be/abc123' }, ctxNoDomains)
    expect(out.safe).toBe(false)
  })
})
