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

export function resolveElectronBin(){
  try {
    const pkgPath = path.dirname(require.resolve('electron/package.json'))
    const binName = fs.readFileSync(path.join(pkgPath, 'path.txt'), 'utf8').trim()
    const full = path.join(pkgPath, 'dist', binName)
    return fs.existsSync(full) ? full : null
  } catch {
    return null
  }
}

let viewerProcess

export function openInElectron(htmlString, policy={}, viewType='generic'){
  const baseDirRaw = usingWinElectron() ? path.dirname(new URL(import.meta.url).pathname) : os.tmpdir()
  const tmpHtmlRaw = path.join(baseDirRaw, `kuttyai_view_${Date.now()}.html`)
  fs.writeFileSync(tmpHtmlRaw, htmlString, 'utf8')
  const electronBinRaw = resolveElectronBin()
  if (!electronBinRaw) {
    console.error('Electron binary not found; try running `npm install` again')
    return
  }
  const mainPathRaw = path.join(path.dirname(new URL(import.meta.url).pathname), 'electron-main.js')
  const useWin = usingWinElectron()
  const electronBin = electronBinRaw
  const tmpHtml = useWin ? toWinPath(tmpHtmlRaw) : tmpHtmlRaw
  const mainPath = useWin ? toWinPath(mainPathRaw) : mainPathRaw
  const args = [mainPath]
  if (useWin) args.push('--no-sandbox')
  const env = { ...process.env, KUTTYAI_VIEW_FILE: tmpHtml, KUTTYAI_VIEW_TYPE: viewType, KUTTYAI_POLICY_JSON: JSON.stringify(policy||{}) }
  if (useWin && !env.DISPLAY) env.DISPLAY = ':0'
  try {
    const child = spawn(electronBin, args, {
      stdio: ['pipe', 'ignore', 'pipe'],
      env,
      detached: false,
      shell: false
    })
    viewerProcess = child
    let stderr = ''
    if (child.stderr) {
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', chunk => { stderr += chunk })
    }
    const cleanup = () => {
      if (viewerProcess && !viewerProcess.killed) {
        try { viewerProcess.kill() } catch {}
        setTimeout(() => {
          if (viewerProcess && !viewerProcess.killed) {
            try { viewerProcess.kill('SIGKILL') } catch {}
          }
        }, 1000)
      }
    }
    process.once('exit', cleanup)
    process.once('SIGINT', () => { cleanup(); process.exit(130) })
    process.once('SIGTERM', () => { cleanup(); process.exit(143) })
    child.on('error', err => {
      console.error('Failed to launch Electron:', err.message)
    })
    child.on('exit', code => {
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
    const baseDirRaw = usingWinElectron() ? path.dirname(new URL(import.meta.url).pathname) : os.tmpdir()
    const tmpHtmlRaw = path.join(baseDirRaw, `kuttyai_view_${Date.now()}.html`)
    const readyFileRaw = path.join(baseDirRaw, `kuttyai_ready_${Date.now()}.txt`)
    fs.writeFileSync(tmpHtmlRaw, htmlString, 'utf8')
    const electronBinRaw = resolveElectronBin()
    if (!electronBinRaw) {
      console.error('Electron binary not found; try running `npm install` again')
      resolve(false)
      return
    }
    const mainPathRaw = path.join(path.dirname(new URL(import.meta.url).pathname), 'electron-main.js')
    const useWin = usingWinElectron()
    const electronBin = electronBinRaw
    const tmpHtml = useWin ? toWinPath(tmpHtmlRaw) : tmpHtmlRaw
    const readyFile = useWin ? toWinPath(readyFileRaw) : readyFileRaw
    const mainPath = useWin ? toWinPath(mainPathRaw) : mainPathRaw
    const args = [mainPath]
    if (useWin) args.push('--no-sandbox')
    const env = { ...process.env, KUTTYAI_VIEW_FILE: tmpHtml, KUTTYAI_VIEW_TYPE: viewType, KUTTYAI_POLICY_JSON: JSON.stringify(policy||{}), KUTTYAI_READY_FILE: readyFile, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
    if (useWin && !env.DISPLAY) env.DISPLAY = ':0'
    let child
    try {
      child = spawn(electronBin, args, {
        stdio: ['pipe', 'ignore', 'pipe'],
        env,
        detached: false,
        shell: false
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
    const timer = setTimeout(()=>{ 
      clearInterval(intv); 
      console.error('Electron did not signal READY within timeout');
      cleanup(false) 
    }, timeoutMs)
  })
}
