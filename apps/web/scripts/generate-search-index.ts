import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildSearchIndex, listSearchLocales, loadMessagesFile } from '../src/lib/search-index'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webRoot = join(scriptDir, '..')
const messagesDir = join(webRoot, 'messages')
const outputDir = join(webRoot, 'public', 'search')

mkdirSync(outputDir, { recursive: true })

for (const locale of listSearchLocales(messagesDir)) {
  const messages = loadMessagesFile(join(messagesDir, `${locale}.json`))
  const index = buildSearchIndex(messages, locale)

  writeFileSync(join(outputDir, `${locale}.json`), `${JSON.stringify(index)}\n`)
  console.log(`Wrote ${index.documents.length} search documents to public/search/${locale}.json`)
}
