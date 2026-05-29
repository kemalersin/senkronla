import { CodeBlockShell } from '@/components/code-block-shell'
import type { CodeBlockLanguage } from '@/lib/code-block-types'
import { highlightCode } from '@/lib/shiki'
import { getLocale } from 'next-intl/server'

export type { CodeBlockLanguage } from '@/lib/code-block-types'

interface CodeBlockProps {
  code: string
  language?: CodeBlockLanguage
}

export async function CodeBlock({ code, language = 'typescript' }: CodeBlockProps) {
  const normalized = code.trimEnd()
  const locale = await getLocale()
  const initialHtml = await highlightCode(normalized, language)

  return (
    <CodeBlockShell
      code={normalized}
      language={language}
      locale={locale}
      initialHtml={initialHtml}
    />
  )
}
