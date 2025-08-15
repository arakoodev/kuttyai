import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const isWsl = process.platform === 'linux' && (process.env.WSL_DISTRO_NAME || os.release().toLowerCase().includes('microsoft'))

function usingWinElectron(){
  if (!isWsl) return false
  try {
    const pkgPath = path.dirname(require.resolve('electron/package.json'))
    const bin = fs.readFileSync(path.join(pkgPath, 'path.txt'), 'utf8').trim().toLowerCase()
    return bin.endsWith('electron.exe')
  } catch {
    return false
  }
}

function toWinPath(p){
  try {
    const out = spawnSync('wslpath', ['-w', p], { encoding:'utf8' })
    if (out.status === 0) return out.stdout.trim()
  } catch {}
  return p
}

let viewerProcess = null

function setupCleanup(){
  const cleanup = () => {
    if (viewerProcess && !viewerProcess.killed){
      try { viewerProcess.kill('SIGKILL') } catch {}
      viewerProcess = null
    }
  }

  process.removeAllListeners('exit')
  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')

  process.once('exit', cleanup)
  process.once('SIGINT', () => { cleanup(); process.exit(130) })
  process.once('SIGTERM', () => { cleanup(); process.exit(143) })
}

export function resolveElectronBin(){
  const res = spawnSync('npx', ['--no-install', 'electron', '--version'], { stdio: 'ignore' })
  return res.status === 0 ? 'npx' : null
}

export function openInElectron(htmlString, policy={}, viewType='generic'){
  const electronBin = resolveElectronBin()
  if (!electronBin){
    console.error('Electron is not installed; run `npm install` and try again')
    return false
  }

  const mainPathRaw = path.join(path.dirname(fileURLToPath(import.meta.url)), 'electron-main.js')
  const useWin = usingWinElectron()
  const mainPath = useWin ? toWinPath(mainPathRaw) : mainPathRaw

  const args = ['electron', mainPath]
  if (useWin || isWsl) args.push('--no-sandbox')

  const env = { ...process.env,
    KUTTYAI_VIEW_HTML: Buffer.from(htmlString, 'utf8').toString('base64'),
    KUTTYAI_VIEW_TYPE: viewType,
    KUTTYAI_POLICY_JSON: JSON.stringify(policy||{}),
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1'
  }
  if (isWsl && !env.DISPLAY) env.DISPLAY = ':0'

  try {
    const child = spawn(electronBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      detached: false
    })

    viewerProcess = child
    setupCleanup()

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', d => console.log('Electron:', d.trim()))

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', d => console.error('Electron stderr:', d.trim()))

    child.on('error', err => {
      console.error('Failed to launch Electron:', err.message)
    })

    child.on('exit', code => {
      if (code !== 0) console.error(`Electron exited with code ${code}`)
    })

    return true
  } catch (e) {
    console.error('Failed to launch Electron:', e.message)
    return false
  }
}

export function openInElectronTest(htmlString, policy={}, viewType='generic', timeoutMs=8000){
  return new Promise((resolve) => {
    const electronBin = resolveElectronBin()
    if (!electronBin){
      console.error('Electron is not installed; run `npm install`')
      resolve(false)
      return
    }

    const readyFileRaw = path.join(os.tmpdir(), `kuttyai_ready_${Date.now()}.txt`)
    const mainPathRaw = path.join(path.dirname(fileURLToPath(import.meta.url)), 'electron-main.js')
    const useWin = usingWinElectron()
    const readyFile = useWin ? toWinPath(readyFileRaw) : readyFileRaw
    const mainPath = useWin ? toWinPath(mainPathRaw) : mainPathRaw

    const args = ['electron', mainPath]
    if (useWin || isWsl) args.push('--no-sandbox')

    const env = { ...process.env,
      KUTTYAI_VIEW_HTML: Buffer.from(htmlString, 'utf8').toString('base64'),
      KUTTYAI_VIEW_TYPE: viewType,
      KUTTYAI_POLICY_JSON: JSON.stringify(policy||{}),
      KUTTYAI_READY_FILE: readyFile,
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1'
    }
    if (isWsl && !env.DISPLAY) env.DISPLAY = ':0'

    let child
    try {
      child = spawn(electronBin, args, {
        stdio: 'ignore',
        env,
        detached: false
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

    const intv = setInterval(() => {
      if (fs.existsSync(readyFile)) { clearInterval(intv); clearTimeout(timer); cleanup(true) }
    }, 100)

    const timer = setTimeout(() => {
      clearInterval(intv)
      console.error('Electron did not signal READY within timeout')
      cleanup(false)
    }, timeoutMs)
  })
}
