import { cookies } from 'next/headers'
import { CodeBlockView } from '@/components/code-block-view'
import type { CodeBlockLanguage } from '@/lib/code-block-types'
import { highlightCode } from '@/lib/shiki'
import { resolveShikiThemeId } from '@/lib/shiki-theme'

export type { CodeBlockLanguage } from '@/lib/code-block-types'

const THEME_COOKIE = 'senkronla-theme'

interface CodeBlockProps {
  code: string
  language?: CodeBlockLanguage
}

export async function CodeBlock({ code, language = 'typescript' }: CodeBlockProps) {
  const normalized = code.trimEnd()
  const cookieStore = await cookies()
  const theme = resolveShikiThemeId(cookieStore.get(THEME_COOKIE)?.value)
  const initialHtml = await highlightCode(normalized, language, theme)

  return (
    <CodeBlockView
      code={normalized}
      language={language}
      initialHtml={initialHtml}
      initialTheme={theme}
    />
  )
}
