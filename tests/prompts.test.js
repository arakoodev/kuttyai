import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadPrompts } from '../src/prompts.js'

describe('loadPrompts', () => {
  it('parses basic xml prompts', async () => {
    const p = path.resolve('tests/tmp.prompts.xml')
    fs.writeFileSync(p, '<kuttyai><system>S</system><perplexsearch>P</perplexsearch><youtube>Y</youtube></kuttyai>', 'utf8')
    const out = await loadPrompts(p)
    expect(out.system).toBe('S')
    expect(out.perplexsearch).toBe('P')
    expect(out.youtube).toBe('Y')
  })
})
