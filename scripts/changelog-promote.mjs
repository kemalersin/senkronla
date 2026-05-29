const UNRELEASED_HEADER_RE = /^## \[Unreleased\]\s*$/m
const RELEASE_HEADER_RE = /^## \[\d/

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

  const before = source.slice(0, headerEnd)
  const after = afterHeader.slice(nextSectionIndex)
  const content = `${before}\n\n## [${version}]\n${trimmedBody}\n${after}`

  return { content, promoted: true, body: trimmedBody }
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
