import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

function resolveElectronBin(){
  const winBin = 'node_modules/.bin/electron.cmd'
  const linuxBin = 'node_modules/.bin/electron'
  const isWsl = process.platform === 'linux' && (process.env.WSL_DISTRO_NAME || os.release().toLowerCase().includes('microsoft'))
  if (process.platform === 'win32') return winBin
  if (isWsl && fs.existsSync(winBin)) return winBin
  return linuxBin
}

export function openInElectron(htmlString, policy={}, viewType='generic'){
  const tmpHtml = path.join(os.tmpdir(), `kuttyai_view_${Date.now()}.html`)
  fs.writeFileSync(tmpHtml, htmlString, 'utf8')
  const electronBin = resolveElectronBin()
  const mainPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'electron-main.js')
  try {
    const child = spawn(electronBin, [mainPath], {
      stdio: 'ignore',
      env: { ...process.env, KUTTYAI_VIEW_FILE: tmpHtml, KUTTYAI_VIEW_TYPE: viewType, KUTTYAI_POLICY_JSON: JSON.stringify(policy||{}) },
      detached: true,
      cwd: process.cwd()
    })
    child.on('error', err => {
      console.error('Failed to launch Electron:', err.message)
    })
    child.on('exit', code => {
      if (code !== 0) console.error(`Electron exited with code ${code}`)
    })
    child.unref()
  } catch (e) {
    console.error('Failed to launch Electron:', e.message)
  }
}

export function openInElectronTest(htmlString, policy={}, viewType='generic', timeoutMs=8000){
  return new Promise((resolve) => {
    const tmpHtml = path.join(os.tmpdir(), `kuttyai_view_${Date.now()}.html`)
    const readyFile = path.join(os.tmpdir(), `kuttyai_ready_${Date.now()}.txt`)
    fs.writeFileSync(tmpHtml, htmlString, 'utf8')
    const electronBin = resolveElectronBin()
    const mainPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'electron-main.js')
    let child
    try {
      child = spawn(electronBin, [mainPath], {
        stdio: 'ignore',
        env: { ...process.env, KUTTYAI_VIEW_FILE: tmpHtml, KUTTYAI_VIEW_TYPE: viewType, KUTTYAI_POLICY_JSON: JSON.stringify(policy||{}), KUTTYAI_READY_FILE: readyFile, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
        detached: false,
        cwd: process.cwd()
      })
    } catch (e) {
      console.error('Failed to launch Electron:', e.message)
      resolve(false)
      return
    }
    let resolved = false
    const cleanup = (ok=true) => { if (resolved) return; resolved = true; try { child.kill() } catch {}; resolve(ok) }
    child.on('error', err => { console.error('Failed to launch Electron:', err.message); cleanup(false) })
    child.on('exit', code => { if (code !== 0) { console.error(`Electron exited with code ${code}`); cleanup(false) } })
    const intv = setInterval(()=>{
      if (fs.existsSync(readyFile)) { clearInterval(intv); clearTimeout(timer); cleanup(true) }
    }, 100)
    const timer = setTimeout(()=>{ clearInterval(intv); cleanup(false) }, timeoutMs)
  })
}
