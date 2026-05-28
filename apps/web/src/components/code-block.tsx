import { CodeBlockCopyButton } from '@/components/code-block-copy-button'
import { highlightCode } from '@/lib/shiki'

export type CodeBlockLanguage = 'typescript' | 'javascript' | 'bash' | 'http' | 'text'

interface CodeBlockProps {
  code: string
  language?: CodeBlockLanguage
}

export async function CodeBlock({ code, language = 'typescript' }: CodeBlockProps) {
  const normalized = code.trimEnd()
  const html = await highlightCode(normalized, language)

  return (
    <div className="code-block">
      <CodeBlockCopyButton code={normalized} />
      <div className="code-block-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
