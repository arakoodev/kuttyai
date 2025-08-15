import { app, BrowserWindow, session } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const VIEW_FILE = process.env.KUTTYAI_VIEW_FILE
const POLICY = safeParse(process.env.KUTTYAI_POLICY_JSON) || { allowDomains: [], bannedTerms: [] }
const READY_FILE = process.env.KUTTYAI_READY_FILE

// Exit if the parent process dies
const parentPid = process.ppid
function checkParent(){
  if (!parentPid) return
  try {
    process.kill(parentPid, 0)
  } catch {
    app.quit()
    process.exit(0)
  }
}
setInterval(checkParent, 2000)
if (process.stdin) {
  process.stdin.on('end', () => {
    app.quit()
    process.exit(0)
  })
  process.stdin.resume()
}

function safeParse(s){ try { return JSON.parse(s || '{}') } catch { return null } }

function writeReadyOnce(){
  if (!READY_FILE) return
  try { if (!fs.existsSync(READY_FILE)) fs.writeFileSync(READY_FILE, 'READY', 'utf8') } catch {}
}

function createWindow(){
  const win = new BrowserWindow({
    width:800, height:600, frame:false, autoHideMenuBar:true, resizable:false,
    webPreferences:{ nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true }
  })
  win.webContents.setWindowOpenHandler(()=>({ action:'deny' }))
  win.webContents.on('will-navigate', e=>e.preventDefault())

  const allow = Array.isArray(POLICY.allowDomains) ? POLICY.allowDomains.map(d=>String(d).toLowerCase()) : []
  session.defaultSession.webRequest.onBeforeRequest({ urls:['*://*/*'] }, (details, cb)=>{
    try {
      const u = new URL(details.url); const h = (u.hostname||'').toLowerCase()
      const ok = allow.length>0 && allow.some(d => h===d || h.endsWith('.'+d))
      if (!ok && !details.url.startsWith('file://') && !details.url.startsWith('data:')) return cb({ cancel:true })
    } catch {}
    return cb({ cancel:false })
  })

  if (VIEW_FILE && fs.existsSync(VIEW_FILE)) win.loadFile(VIEW_FILE)
  else {
    const tmp = path.join(app.getPath('temp'), 'kuttyai_fallback.html')
    fs.writeFileSync(tmp, '<!doctype html><html><body>Missing view file</body></html>', 'utf8')
    win.loadFile(tmp)
  }

  win.webContents.once('did-finish-load', writeReadyOnce)
  setTimeout(writeReadyOnce, 800)
}

app.whenReady().then(()=>{
  createWindow()
  app.on('activate', ()=>{ if (BrowserWindow.getAllWindows().length===0) createWindow() })
})

app.on('window-all-closed', ()=>app.quit())

