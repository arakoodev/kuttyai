
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const BIN = path.resolve('bin/kuttyai.cjs')

function run(cmd, args, env={}){
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, cwd: process.cwd() })
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
    const res = await run(BIN, [
      'perplexsearch',
      '--input','Why does it rain? Explain simply.',
      '--domains', domainsPath,
      '--banned','examples/banned.json'
    ], { KUTTYAI_TEST_MOCK: '1', OPENAI_API_KEY: 'test', GOOGLE_API_KEY: 'test', GOOGLE_CSE_ID: 'test' })
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/Sources:/)
    expect(res.out).toMatch(/https?:\/\/kids\.nationalgeographic\.com/)
  }, 20000)
})
