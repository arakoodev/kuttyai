
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

describe('CLI youtube (mock mode)', () => {
  it('prints a safe video choice with a real YouTube URL', async () => {
    const domainsPath = path.resolve('tests/tmp.domains.youtube.json')
    fs.writeFileSync(domainsPath, JSON.stringify({ domains: ['youtube.com','www.youtube.com','youtu.be'] }, null, 2))
    const res = await runNpx([
      '--yes','.',
      'youtube',
      '--input','water cycle song for kids',
      '--domains', domainsPath,
      '--banned','examples/banned.json',
      '--no-view'
    ], { KUTTYAI_TEST_MOCK: '1', YOUTUBE_API_KEY: 'test', OPENAI_API_KEY:'test', CI:'1' })
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/Video:/)
    expect(res.out).toMatch(/Safety: allow/)
    expect(res.out).toMatch(/https?:\/\/www\.youtube\.com\/watch\?v=/)
  }, 20000)

  it('blocks video when title has banned term', async () => {
    const domainsPath = path.resolve('tests/tmp.domains.youtube.json')
    fs.writeFileSync(domainsPath, JSON.stringify({ domains: ['youtube.com','www.youtube.com','youtu.be'] }, null, 2))
    const bannedPath = path.resolve('tests/tmp.banned.youtube.json')
    fs.writeFileSync(bannedPath, JSON.stringify({ banned: ['water'] }, null, 2))
    const res = await runNpx([
      '--yes','.',
      'youtube',
      '--input','water cycle song for kids',
      '--domains', domainsPath,
      '--banned', bannedPath,
      '--no-view'
    ], { KUTTYAI_TEST_MOCK: '1', YOUTUBE_API_KEY: 'test', OPENAI_API_KEY:'test', CI:'1' })
    expect(res.code).toBe(1)
    expect(res.err).toMatch(/banned term/i)
  }, 20000)
})
