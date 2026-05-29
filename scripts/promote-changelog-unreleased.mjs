import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promoteUnreleasedChangelog } from './changelog-promote.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CHANGELOG = join(ROOT, 'CHANGELOG.md')
const PACKAGE_JSON = join(ROOT, 'package.json')

function main() {
  const { version } = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'))
  const source = readFileSync(CHANGELOG, 'utf-8')
  const { content, promoted, body } = promoteUnreleasedChangelog(source, version)

  if (!promoted) {
    console.warn(`[changelog] [Unreleased] is empty; CHANGELOG.md unchanged (${version}).`)
    return
  }

  writeFileSync(CHANGELOG, content)
  const lines = body.split('\n').filter((line) => line.trim()).length
  console.log(`[changelog] [Unreleased] → [${version}] (${lines} lines moved)`)
}

main()
