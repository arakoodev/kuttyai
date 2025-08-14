import { describe, it, expect } from 'vitest'
import * as toolkit from '../src/toolkit/index.js'

describe('policy allowlist checks', () => {
  const ctxNone = { policy: { allowDomains: [], bannedTerms: [] }, openai: null, model: 'test', prompts: {} }
  const ctxYt = { policy: { allowDomains: ['youtube.com','youtu.be','www.youtube.com'], bannedTerms: [] }, openai: null, model: 'test', prompts: {} }
  it('refuses when no allowlist is provided', async () => {
    const out = await toolkit.safeSearch({ query: 'space for kids' }, ctxNone)
    expect(out.safe).toBe(false)
  })
  it('openSafeUrl allows youtu.be', async () => {
    const out = await toolkit.openSafeUrl({ url: 'https://youtu.be/abc123' }, ctxYt)
    expect(out.safe).toBe(true)
    expect(out.videoId).toBe('abc123')
  })
  it('blocks non-allowlisted domain', async () => {
    const out = await toolkit.openSafeUrl({ url: 'https://example.com/page' }, ctxYt)
    expect(out.safe).toBe(false)
  })
})
