#!/usr/bin/env node

import pkg from '../package.json' with { type: 'json' }
import { runGenerateUnlockCode } from './commands/generate-unlock-code.js'

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`Senkronla CLI v${pkg.version}

Usage:
  senkronla generate-unlock-code --namespace-id <uuid> --slots <number>

Run a command with --help for details.`)
  process.exit(0)
}

const [command, ...rest] = args

if (command === 'generate-unlock-code') {
  await runGenerateUnlockCode(rest)
  process.exit(0)
}

console.error(`Unknown command: ${command}`)
process.exit(1)
