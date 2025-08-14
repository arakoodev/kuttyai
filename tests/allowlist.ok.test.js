import { describe, it, expect } from 'vitest'
import * as toolkit from '../src/toolkit/index.js'

const ctxDomains = { policy: { allowDomains: ['youtube.com','youtu.be','www.youtube.com'], bannedTerms: [] }, openai: null, model: 'test', prompts: {} }

describe('openSafeUrl with allowlist', () => {
  it('allows youtu.be embed without network', async () => {
    const out = await toolkit.openSafeUrl({ url: 'https://youtu.be/abc123' }, ctxDomains)
    expect(out.safe).toBe(true)
    expect(out.videoId).toBe('abc123')
    expect(typeof out.embedHtml).toBe('string')
  })
})
