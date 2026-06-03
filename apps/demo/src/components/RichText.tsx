import { Fragment, type ReactNode } from 'react'

/**
 * Minimal inline renderer for tutorial copy: supports **bold**, `code`
 * and [label](url). Anything else is rendered as plain text.
 */
export function RichText({ text }: { text: string }): ReactNode {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  const parts = text.split(pattern).filter((part) => part.length > 0)

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={index}>{part.slice(1, -1)}</code>
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) {
          return (
            <a key={index} href={link[2]} target="_blank" rel="noreferrer">
              {link[1]}
            </a>
          )
        }
        return <Fragment key={index}>{part}</Fragment>
      })}
    </>
  )
}
