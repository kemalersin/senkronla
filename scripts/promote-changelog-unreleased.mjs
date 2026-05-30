import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  changelogPathForPackage,
  findWorkspacePackageJsonFiles,
  promoteUnreleasedChangelog,
  syncPackageJsonVersion,
} from './changelog-promote.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ROOT_CHANGELOG = join(ROOT, 'CHANGELOG.md')
const ROOT_PACKAGE_JSON = join(ROOT, 'package.json')

/**
 * @param {string} filePath
 * @param {string} version
 * @returns {boolean}
 */
function promoteChangelogFile(filePath, version) {
  const source = readFileSync(filePath, 'utf-8')
  const { content, promoted, body } = promoteUnreleasedChangelog(source, version)
  const label = relative(ROOT, filePath)

  if (!promoted) {
    console.warn(`[changelog] ${label}: [Unreleased] empty, skipped`)
    return false
  }

  writeFileSync(filePath, content)
  const lines = body.split('\n').filter((line) => line.trim()).length
  console.log(`[changelog] ${label}: [Unreleased] → [${version}] (${lines} lines)`)
  return true
}

/**
 * @param {string} filePath
 * @param {string} version
 * @returns {boolean}
 */
function syncPackageJsonFile(filePath, version) {
  const source = readFileSync(filePath, 'utf-8')
  const { content, changed, previous } = syncPackageJsonVersion(source, version)
  const label = relative(ROOT, filePath)

  if (!changed) {
    if (previous === version) {
      console.log(`[changelog] ${label}: already ${version}`)
    } else if (previous === null) {
      console.warn(`[changelog] ${label}: no version field, skipped`)
    }
    return false
  }

  writeFileSync(filePath, content)
  console.log(`[changelog] ${label}: ${previous} → ${version}`)
  return true
}

function main() {
  const { version } = JSON.parse(readFileSync(ROOT_PACKAGE_JSON, 'utf-8'))
  console.log(`[changelog] syncing monorepo release ${version}`)

  promoteChangelogFile(ROOT_CHANGELOG, version)

  for (const packageJsonPath of findWorkspacePackageJsonFiles(ROOT)) {
    syncPackageJsonFile(packageJsonPath, version)

    const changelogPath = changelogPathForPackage(packageJsonPath)
    if (changelogPath) {
      promoteChangelogFile(changelogPath, version)
    }
  }
}

main()
