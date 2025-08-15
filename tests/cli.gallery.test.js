
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

describe('CLI gallery (mock mode)', () => {
  it('prints a gallery list including real image host URLs', async () => {
    const domainsPath = path.resolve('tests/tmp.domains.gallery.json')
    fs.writeFileSync(domainsPath, JSON.stringify({ domains: ['images.nasa.gov','www.nasa.gov','nasa.gov'] }, null, 2))
    const envPath = path.resolve('.env')
    const originalEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : null
    fs.writeFileSync(envPath, 'OPENAI_API_KEY=test\nGOOGLE_API_KEY=test\nGOOGLE_CSE_ID=test\n')
    const res = await runNpx([
      '--yes','.',
      'gallery',
      '--input','rainbow drawings for kids',
      '--domains', domainsPath,
      '--banned','examples/banned.json',
      '--no-view'
    ], { KUTTYAI_TEST_MOCK: '1', CI:'1' })
    if (originalEnv) fs.writeFileSync(envPath, originalEnv)
    else fs.unlinkSync(envPath)
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/Gallery images:/)
    expect(res.out).toMatch(/https?:\/\/images\.nasa\.gov\//)
  }, 20000)
})
