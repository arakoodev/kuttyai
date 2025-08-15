#!/usr/bin/env node
// Auto-load environment variables then delegate to the ESM CLI.
import 'dotenv/config'
import { main } from './cli.mjs'

main(process.argv).catch(err => {
  console.error(err && err.stack ? err.stack : String(err))
  process.exitCode = 1
})

