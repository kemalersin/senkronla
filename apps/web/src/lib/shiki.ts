import { createHighlighter, type Highlighter } from 'shiki'

let highlighterPromise: Promise<Highlighter> | null = null

const themes = ['github-light', 'github-dark'] as const
const langs = ['typescript', 'javascript', 'bash', 'http', 'text', 'plaintext'] as const

export function getShikiHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [...themes],
      langs: [...langs],
    })
  }
  return highlighterPromise
}

export async function highlightCode(code: string, language: string): Promise<string> {
  const highlighter = await getShikiHighlighter()
  const supported = new Set(highlighter.getLoadedLanguages())
  const lang = supported.has(language) ? language : 'text'

  return highlighter.codeToHtml(code, {
    lang,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    defaultColor: false,
  })
}
