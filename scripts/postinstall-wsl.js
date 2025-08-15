import os from 'node:os'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const isWsl = process.platform === 'linux' && (process.env.WSL_DISTRO_NAME || os.release().toLowerCase().includes('microsoft'))

if (isWsl && !process.env.KUTTYAI_WSL_INSTALL) {
  console.log('WSL detected; reinstalling modules for Windows...')
  if (fs.existsSync('node_modules')) {
    fs.rmSync('node_modules', { recursive: true, force: true })
  }
  const npmCli = process.env.npm_execpath || 'npm'
  const result = spawnSync(process.execPath, [npmCli, 'install'], {
    stdio: 'inherit',
    env: { ...process.env, npm_config_platform: 'win32', KUTTYAI_WSL_INSTALL: '1' }
  })
  process.exit(result.status ?? 0)
}
