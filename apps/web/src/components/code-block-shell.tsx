'use client'

import { useEffect, useRef, useState } from 'react'
import { CodeBlockCopyButton } from '@/components/code-block-copy-button'
import type { CodeBlockLanguage } from '@/lib/code-block-types'
import { highlightCodeClient } from '@/lib/highlight-code-client'

interface CodeBlockShellProps {
  code: string
  language: CodeBlockLanguage
  locale: string
  initialHtml: string
}

export function CodeBlockShell({ code, language, locale, initialHtml }: CodeBlockShellProps) {
  const normalized = code.trimEnd()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState(initialHtml)
  const requestIdRef = useRef(0)

  useEffect(() => {
    setHtml(initialHtml)
    if (bodyRef.current) {
      bodyRef.current.innerHTML = initialHtml
    }
  }, [initialHtml, locale])

  useEffect(() => {
    const requestId = ++requestIdRef.current
    let cancelled = false

    void highlightCodeClient(normalized, language).then((highlighted) => {
      if (cancelled || requestId !== requestIdRef.current) {
        return
      }
      setHtml(highlighted)
      if (bodyRef.current) {
        bodyRef.current.innerHTML = highlighted
      }
    })

    return () => {
      cancelled = true
    }
  }, [normalized, language, locale])

  useEffect(() => {
    if (bodyRef.current && bodyRef.current.innerHTML !== html) {
      bodyRef.current.innerHTML = html
    }
  }, [html])

  return (
    <div className="code-block">
      <CodeBlockCopyButton code={normalized} />
      <div
        ref={bodyRef}
        className="code-block-body"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
