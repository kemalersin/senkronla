import { createHighlighter, type Highlighter } from 'shiki'
import type { ShikiThemeId } from '@/lib/shiki-theme'

let highlighterPromise: Promise<Highlighter> | null = null

const themes = ['github-light', 'github-dark'] as const
const langs = ['typescript', 'javascript', 'bash', 'http', 'jsonc', 'yaml', 'text', 'plaintext'] as const

export function getShikiHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [...themes],
      langs: [...langs],
    })
  }
  return highlighterPromise
}

export async function highlightCode(
  code: string,
  language: string,
  theme: ShikiThemeId = 'github-light',
): Promise<string> {
  const highlighter = await getShikiHighlighter()
  const supported = new Set(highlighter.getLoadedLanguages())
  const lang = supported.has(language) ? language : 'text'

  return highlighter.codeToHtml(code, {
    lang,
    theme,
  })
}
