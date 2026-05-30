import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const UNRELEASED_HEADER_RE = /^## \[Unreleased\]\s*$/m
const RELEASE_HEADER_RE = /^## \[\d/
const PACKAGE_VERSION_RE = /("version"\s*:\s*")([^"]+)(")/

/**
 * @param {string} source
 * @param {string} version
 * @returns {{ content: string; promoted: boolean; body: string }}
 */
export function promoteUnreleasedChangelog(source, version) {
  const unreleasedMatch = source.match(UNRELEASED_HEADER_RE)
  if (!unreleasedMatch || unreleasedMatch.index === undefined) {
    return { content: source, promoted: false, body: '' }
  }

  const unreleasedIndex = unreleasedMatch.index
  const headerEnd = unreleasedIndex + unreleasedMatch[0].length
  const afterHeader = source.slice(headerEnd)
  const nextSectionIndex = findNextReleaseSectionIndex(afterHeader)
  const body = afterHeader.slice(0, nextSectionIndex)
  const trimmedBody = body.trim()

  if (!trimmedBody) {
    return { content: source, promoted: false, body: '' }
  }

  const before = source.slice(0, headerEnd).replace(/\n+$/, '')
  const after = afterHeader.slice(nextSectionIndex).replace(/^\n+/, '')
  const content = `${before}\n\n## [${version}]\n\n${trimmedBody}\n\n${after}`

  return { content, promoted: true, body: trimmedBody }
}

/**
 * @param {string} source
 * @param {string} version
 * @returns {{ content: string; changed: boolean; previous: string | null }}
 */
export function syncPackageJsonVersion(source, version) {
  const match = source.match(PACKAGE_VERSION_RE)
  if (!match) {
    return { content: source, changed: false, previous: null }
  }

  const previous = match[2]
  const content = source.replace(PACKAGE_VERSION_RE, `$1${version}$3`)

  return { content, changed: content !== source, previous }
}

/**
 * @param {string} root
 * @returns {string[]}
 */
export function findWorkspacePackageJsonFiles(root) {
  const files = []

  for (const workspaceRoot of ['packages', 'apps']) {
    const base = join(root, workspaceRoot)
    if (!existsSync(base)) continue

    for (const entry of readdirSync(base)) {
      const dir = join(base, entry)
      if (!statSync(dir).isDirectory()) continue

      const packageJson = join(dir, 'package.json')
      if (existsSync(packageJson)) {
        files.push(packageJson)
      }
    }
  }

  return files.sort()
}

/**
 * @param {string} packageJsonPath
 * @returns {string | null}
 */
export function changelogPathForPackage(packageJsonPath) {
  const dir = join(packageJsonPath, '..')
  const changelog = join(dir, 'CHANGELOG.md')
  return existsSync(changelog) ? changelog : null
}

/** @param {string} afterUnreleasedHeader */
function findNextReleaseSectionIndex(afterUnreleasedHeader) {
  const lines = afterUnreleasedHeader.split('\n')
  let offset = 0

  for (const line of lines) {
    if (RELEASE_HEADER_RE.test(line)) {
      return offset
    }
    offset += line.length + 1
  }

  return afterUnreleasedHeader.length
}
