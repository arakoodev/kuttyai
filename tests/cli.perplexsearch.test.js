
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function runNpx(args, env={}){
  return new Promise((resolve) => {
    const p = spawn(NPX, args, { env: { ...process.env, ...env }, cwd: process.cwd() })
    let out = '', err = ''
    p.stdout.on('data', d => out += d.toString())
    p.stderr.on('data', d => err += d.toString())
    p.on('close', code => resolve({ code, out, err }))
  })
}

describe('CLI perplexsearch (mock mode)', () => {
  it('prints an answer and sources with real URLs', async () => {
    const domainsPath = path.resolve('tests/tmp.domains.json')
    fs.writeFileSync(domainsPath, JSON.stringify({ domains: ['kids.nationalgeographic.com','images.nasa.gov','www.nasa.gov','nasa.gov'] }, null, 2))
    const res = await runNpx([
      '--yes','.',
      'perplexsearch',
      '--input','Why does it rain? Explain simply.',
      '--domains', domainsPath,
      '--banned','examples/banned.json',
      '--no-view'
    ], { KUTTYAI_TEST_MOCK: '1', OPENAI_API_KEY: 'test', GOOGLE_API_KEY: 'test', GOOGLE_CSE_ID: 'test', CI:'1' })
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/Sources:/)
    expect(res.out).toMatch(/Safety: allow/)
    expect(res.out).toMatch(/https?:\/\/kids\.nationalgeographic\.com/)
  }, 20000)

  it('fails when answer contains banned term', async () => {
    const domainsPath = path.resolve('tests/tmp.domains.json')
    fs.writeFileSync(domainsPath, JSON.stringify({ domains: ['kids.nationalgeographic.com','images.nasa.gov','www.nasa.gov','nasa.gov'] }, null, 2))
    const bannedPath = path.resolve('tests/tmp.banned.perplex.json')
    fs.writeFileSync(bannedPath, JSON.stringify({ banned: ['rain'] }, null, 2))
    const res = await runNpx([
      '--yes','.',
      'perplexsearch',
      '--input','Why does it rain? Explain simply.',
      '--domains', domainsPath,
      '--banned', bannedPath,
      '--no-view'
    ], { KUTTYAI_TEST_MOCK: '1', OPENAI_API_KEY: 'test', GOOGLE_API_KEY: 'test', GOOGLE_CSE_ID: 'test', CI:'1' })
    expect(res.code).toBe(1)
    expect(res.err).toMatch(/banned term/i)
  }, 20000)
})
