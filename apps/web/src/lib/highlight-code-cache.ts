import type { CodeBlockLanguage } from '@/lib/code-block-types'
import { highlightCodeClient } from '@/lib/highlight-code-client'
import { readDocumentShikiTheme, type ShikiThemeId } from '@/lib/shiki-theme'

const htmlCache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

function cacheKey(theme: ShikiThemeId, language: CodeBlockLanguage, code: string) {
  return `${theme}:${language}:${code}`
}

export function clearHighlightCache() {
  htmlCache.clear()
  inflight.clear()
}

export function getCachedHighlightHtml(
  theme: ShikiThemeId,
  language: CodeBlockLanguage,
  code: string,
): string | undefined {
  return htmlCache.get(cacheKey(theme, language, code))
}

export function seedHighlightCache(
  theme: ShikiThemeId,
  language: CodeBlockLanguage,
  code: string,
  html: string,
) {
  htmlCache.set(cacheKey(theme, language, code), html)
}

export function highlightCodeCached(
  code: string,
  language: CodeBlockLanguage,
  theme: ShikiThemeId = readDocumentShikiTheme(),
): Promise<string> {
  const key = cacheKey(theme, language, code)
  const cached = htmlCache.get(key)

  if (cached) {
    return Promise.resolve(cached)
  }

  const pending = inflight.get(key)

  if (pending) {
    return pending
  }

  const promise = highlightCodeClient(code, language, theme)
    .then((html) => {
      htmlCache.set(key, html)
      inflight.delete(key)
      return html
    })
    .catch((error) => {
      inflight.delete(key)
      throw error
    })

  inflight.set(key, promise)
  return promise
}
