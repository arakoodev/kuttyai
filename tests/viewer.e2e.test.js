import { describe, it, expect, afterAll } from 'vitest'
import { openInElectronTest } from '../viewer/launch.js'

let xvfbProc = null
let hasXvfb = true
if (!process.env.DISPLAY) {
  try {
    const { default: Xvfb } = await import('xvfb')
    xvfbProc = new Xvfb({ xvfb_args: ['-screen', '0', '1280x720x24', '-ac', '+extension', 'RANDR'] })
    await new Promise((resolve, reject) => xvfbProc.start(err => err ? reject(err) : resolve()))
  } catch (e) {
    console.warn('Xvfb unavailable; skipping viewer e2e.')
    hasXvfb = false
  }
}

afterAll(async () => {
  if (xvfbProc) {
    try { xvfbProc.stopSync() } catch {}
  }
})

const testFn = hasXvfb ? it : it.skip

describe('Electron viewer e2e (test mode)', () => {
  testFn('spawns and signals READY with policy', async () => {
    const html = '<!doctype html><html><body><h1>Hello</h1></body></html>'
    const policy = { allowDomains: ['youtube.com','youtu.be','images.nasa.gov'], bannedTerms: [] }
    const ok = await openInElectronTest(html, policy, 'generic', 15000)
    expect(ok).toBe(true)
  }, 30000)
})
