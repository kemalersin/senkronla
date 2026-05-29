import { readFileSync, readdirSync } from 'node:fs'

export interface SearchDocument {
  id: string
  title: string
  page: string
  section: string
  href: string
  body: string
}

export interface SearchIndexFile {
  version: 1
  locale: string
  generatedAt: string
  documents: SearchDocument[]
}

interface DocPageSource {
  messageKey: string
  href: string
}

const DOC_PAGE_SOURCES: DocPageSource[] = [
  { messageKey: 'guides', href: '/guides' },
  { messageKey: 'esrGuide', href: '/guides/esr' },
  { messageKey: 'agentsGuide', href: '/guides/agents' },
  { messageKey: 'sdk', href: '/sdk' },
  { messageKey: 'api', href: '/api' },
]

export function navIdToSectionKey(navId: string): string {
  if (navId.includes('-')) {
    return navId.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
  }
  return navId
}

export function stripRichText(text: string): string {
  return text
    .replace(/<tag>(.*?)<\/tag>/g, '$1')
    .replace(/\{'\{'/g, '{')
    .replace(/'\}'\}/g, '}')
    .replace(/\{relayUrl\}/g, '')
    .replace(/''/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function collectStrings(value: unknown, strings: string[]): void {
  if (typeof value === 'string') {
    const cleaned = stripRichText(value)
    if (cleaned.length > 1) {
      strings.push(cleaned)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, strings)
    }
    return
  }

  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) {
      collectStrings(nested, strings)
    }
  }
}

function flattenSectionBody(section: unknown): string {
  const strings: string[] = []
  collectStrings(section, strings)
  return strings.join(' ')
}

function indexInteractivePages(messages: Record<string, unknown>): SearchDocument[] {
  const documents: SearchDocument[] = []

  for (const source of DOC_PAGE_SOURCES) {
    const pageRoot = messages[source.messageKey] as Record<string, unknown> | undefined
    if (!pageRoot) {
      continue
    }

    const pageTitle = typeof pageRoot.title === 'string' ? stripRichText(pageRoot.title) : source.messageKey
    const intro = typeof pageRoot.intro === 'string' ? stripRichText(pageRoot.intro) : ''
    const nav = pageRoot.nav as Record<string, string> | undefined
    const sections = pageRoot.sections as Record<string, unknown> | undefined

    if (intro) {
      documents.push({
        id: `${source.messageKey}:intro`,
        title: pageTitle,
        page: pageTitle,
        section: '',
        href: source.href,
        body: intro,
      })
    }

    if (!nav || !sections) {
      continue
    }

    for (const [navId, navLabel] of Object.entries(nav)) {
      const sectionKey = navIdToSectionKey(navId)
      const section = sections[sectionKey]
      if (!section || typeof section !== 'object') {
        continue
      }

      const sectionRecord = section as Record<string, unknown>
      const sectionTitle =
        typeof sectionRecord.title === 'string' ? stripRichText(sectionRecord.title) : stripRichText(navLabel)
      const body = flattenSectionBody(section)

      documents.push({
        id: `${source.messageKey}:${navId}`,
        title: sectionTitle,
        page: pageTitle,
        section: stripRichText(navLabel),
        href: `${source.href}#${navId}`,
        body,
      })
    }
  }

  return documents
}

export function buildSearchIndex(messages: Record<string, unknown>, locale: string): SearchIndexFile {
  return {
    version: 1,
    locale,
    generatedAt: new Date().toISOString(),
    documents: indexInteractivePages(messages),
  }
}

export function loadMessagesFile(messagesPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(messagesPath, 'utf8')) as Record<string, unknown>
}

export function listSearchLocales(messagesDir: string): string[] {
  return readdirSync(messagesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
}
