import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

export function openInElectron(htmlString, policy={}, viewType='generic'){
  const tmpHtml = path.join(os.tmpdir(), `kuttyai_view_${Date.now()}.html`)
  fs.writeFileSync(tmpHtml, htmlString, 'utf8')
  const electronBin = process.platform === 'win32' ? 'node_modules/.bin/electron.cmd' : 'node_modules/.bin/electron'
  const mainPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'electron-main.js')
  const child = spawn(electronBin, [mainPath], {
    stdio: 'ignore',
    env: { ...process.env, KUTTYAI_VIEW_FILE: tmpHtml, KUTTYAI_VIEW_TYPE: viewType, KUTTYAI_POLICY_JSON: JSON.stringify(policy||{}) },
    detached: true,
    cwd: process.cwd()
  })
  child.unref()
}

export function openInElectronTest(htmlString, policy={}, viewType='generic', timeoutMs=8000){
  return new Promise((resolve) => {
    const tmpHtml = path.join(os.tmpdir(), `kuttyai_view_${Date.now()}.html`)
    const readyFile = path.join(os.tmpdir(), `kuttyai_ready_${Date.now()}.txt`)
    fs.writeFileSync(tmpHtml, htmlString, 'utf8')
    const electronBin = process.platform === 'win32' ? 'node_modules/.bin/electron.cmd' : 'node_modules/.bin/electron'
    const mainPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'electron-main.js')
    const child = spawn(electronBin, [mainPath], {
      stdio: 'ignore',
      env: { ...process.env, KUTTYAI_VIEW_FILE: tmpHtml, KUTTYAI_VIEW_TYPE: viewType, KUTTYAI_POLICY_JSON: JSON.stringify(policy||{}), KUTTYAI_READY_FILE: readyFile, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
      detached: false,
      cwd: process.cwd()
    })
    let resolved = false
    const cleanup = () => { if (resolved) return; resolved = true; try { child.kill() } catch {}; resolve(true) }
    const intv = setInterval(()=>{
      if (fs.existsSync(readyFile)) { clearInterval(intv); clearTimeout(timer); cleanup() }
    }, 100)
    const timer = setTimeout(()=>{ clearInterval(intv); cleanup() }, timeoutMs)
  })
}
