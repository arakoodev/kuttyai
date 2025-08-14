#!/usr/bin/env node
// CommonJS shim that dynamically imports the ESM CLI so Node 20/22 handle the shebang correctly.
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const fs = require('node:fs')

const cliPath = path.join(__dirname, 'cli.mjs')
// Node will execute ESM when imported via file://
import(pathToFileURL(cliPath).href).then(mod => {
  if (typeof mod.main === 'function') {
    mod.main(process.argv).catch(err => {
      console.error(err && err.stack || String(err))
      process.exitCode = 1
    })
  }
}).catch(err => {
  console.error(err && err.stack || String(err))
  process.exitCode = 1
})
