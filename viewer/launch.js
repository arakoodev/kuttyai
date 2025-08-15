import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const isWsl = process.platform === 'linux' && (process.env.WSL_DISTRO_NAME || os.release().toLowerCase().includes('microsoft'))

function usingWinElectron(){
  if (!isWsl) return false
  try {
    const pkg = require.resolve('electron/package.json')
    const bin = fs.readFileSync(path.join(path.dirname(pkg), 'path.txt'), 'utf8').trim().toLowerCase()
    return bin.endsWith('electron.exe')
  } catch { return false }
}

function toWinPath(p){
  try {
    const out = spawnSync('wslpath', ['-w', p], { encoding:'utf8' })
    if (out.status === 0) return out.stdout.trim()
  } catch {}
  return p
}

function resolveElectronBin(){
  try {
    const pkgPath = path.dirname(require.resolve('electron/package.json'))
    const binRel = fs.readFileSync(path.join(pkgPath, 'path.txt'), 'utf8').trim()
    return path.join(pkgPath, binRel)
  } catch {
    return null
  }
}

export function openInElectron(htmlString, policy={}, viewType='generic'){
  const tmpHtmlRaw = path.join(os.tmpdir(), `kuttyai_view_${Date.now()}.html`)
  fs.writeFileSync(tmpHtmlRaw, htmlString, 'utf8')
  const electronBin = resolveElectronBin()
  if (!electronBin) {
    console.error('Electron binary not found; try running `npm install` again')
    return
  }
  const mainPathRaw = path.join(path.dirname(new URL(import.meta.url).pathname), 'electron-main.js')
  const useWin = usingWinElectron()
  const tmpHtml = useWin ? toWinPath(tmpHtmlRaw) : tmpHtmlRaw
  const mainPath = useWin ? toWinPath(mainPathRaw) : mainPathRaw
  const cwd = useWin ? toWinPath(process.cwd()) : process.cwd()
  try {
    const child = spawn(electronBin, [mainPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, KUTTYAI_VIEW_FILE: tmpHtml, KUTTYAI_VIEW_TYPE: viewType, KUTTYAI_POLICY_JSON: JSON.stringify(policy||{}) },
      detached: true,
      cwd
    })
    let stderr = ''
    if (child.stderr) {
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', chunk => { stderr += chunk })
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      if (child.stderr) child.stderr.unref()
    }
    const timer = setTimeout(() => {
      finish()
      child.unref()
    }, 3000)
    child.on('error', err => {
      clearTimeout(timer)
      finish()
      console.error('Failed to launch Electron:', err.message)
    })
    child.on('exit', code => {
      clearTimeout(timer)
      finish()
      if (code !== 0) {
        const msg = stderr.trim()
        console.error(`Electron exited with code ${code}${msg ? `: ${msg}` : ''}`)
      }
    })
  } catch (e) {
    console.error('Failed to launch Electron:', e.message)
  }
}

export function openInElectronTest(htmlString, policy={}, viewType='generic', timeoutMs=8000){
  return new Promise((resolve) => {
    const tmpHtmlRaw = path.join(os.tmpdir(), `kuttyai_view_${Date.now()}.html`)
    const readyFileRaw = path.join(os.tmpdir(), `kuttyai_ready_${Date.now()}.txt`)
    fs.writeFileSync(tmpHtmlRaw, htmlString, 'utf8')
    const electronBin = resolveElectronBin()
    if (!electronBin) {
      console.error('Electron binary not found; try running `npm install` again')
      resolve(false)
      return
    }
    const mainPathRaw = path.join(path.dirname(new URL(import.meta.url).pathname), 'electron-main.js')
    const useWin = usingWinElectron()
    const tmpHtml = useWin ? toWinPath(tmpHtmlRaw) : tmpHtmlRaw
    const readyFile = useWin ? toWinPath(readyFileRaw) : readyFileRaw
    const mainPath = useWin ? toWinPath(mainPathRaw) : mainPathRaw
    const cwd = useWin ? toWinPath(process.cwd()) : process.cwd()
    let child
    try {
      child = spawn(electronBin, [mainPath], {
        stdio: 'ignore',
        env: { ...process.env, KUTTYAI_VIEW_FILE: tmpHtml, KUTTYAI_VIEW_TYPE: viewType, KUTTYAI_POLICY_JSON: JSON.stringify(policy||{}), KUTTYAI_READY_FILE: readyFile, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
        detached: false,
        cwd
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
