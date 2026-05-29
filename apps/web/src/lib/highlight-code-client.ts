import type { CodeBlockLanguage } from '@/lib/code-block-types'

type BundledHighlighter = Awaited<
  ReturnType<(typeof import('shiki/bundle/web'))['getSingletonHighlighter']>
>

let highlighterPromise: Promise<BundledHighlighter> | null = null

function toShikiLang(language: CodeBlockLanguage): string {
  return language === 'text' ? 'plaintext' : language
}

async function getClientHighlighter() {
  if (!highlighterPromise) {
    const { getSingletonHighlighter } = await import('shiki/bundle/web')
    highlighterPromise = getSingletonHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: ['typescript', 'javascript', 'bash', 'http', 'jsonc', 'plaintext'],
    })
  }
  return highlighterPromise
}

export async function highlightCodeClient(
  code: string,
  language: CodeBlockLanguage,
): Promise<string> {
  const highlighter = await getClientHighlighter()
  const lang = toShikiLang(language)
  const loaded = new Set(highlighter.getLoadedLanguages())
  const resolved = (loaded.has(lang) ? lang : 'plaintext') as 'typescript'

  return highlighter.codeToHtml(code, {
    lang: resolved,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    defaultColor: false,
  })
}
