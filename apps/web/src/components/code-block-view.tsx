'use client'

import { useLocale } from 'next-intl'
import { useCallback, useLayoutEffect, useRef } from 'react'
import { CodeBlockCopyButton } from '@/components/code-block-copy-button'
import { usePathname } from '@/i18n/navigation'
import type { CodeBlockLanguage } from '@/lib/code-block-types'
import {
  getCachedHighlightHtml,
  highlightCodeCached,
  seedHighlightCache,
} from '@/lib/highlight-code-cache'
import {
  readDocumentShikiTheme,
  SHIKI_THEME_CHANGED_EVENT,
  type ShikiThemeId,
} from '@/lib/shiki-theme'

interface CodeBlockViewProps {
  code: string
  language: CodeBlockLanguage
  initialHtml?: string
  initialTheme?: ShikiThemeId
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function fallbackHtml(code: string) {
  return `<pre class="code-block-fallback"><code>${escapeHtml(code)}</code></pre>`
}

export function CodeBlockView({
  code,
  language,
  initialHtml,
  initialTheme = 'github-light',
}: CodeBlockViewProps) {
  const normalized = code.trimEnd()
  const locale = useLocale()
  const pathname = usePathname()
  const navigationKey = `${locale}:${pathname}`
  const bodyRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)

  const paint = useCallback((html: string) => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = html
    }
  }, [])

  useLayoutEffect(() => {
    if (initialHtml) {
      seedHighlightCache(initialTheme, language, normalized, initialHtml)
    }
  }, [initialHtml, initialTheme, language, normalized])

  useLayoutEffect(() => {
    const requestId = ++requestIdRef.current
    let cancelled = false

    function applyResolvedHtml(html: string) {
      if (cancelled || requestId !== requestIdRef.current) {
        return
      }
      paint(html)
    }

    function resolveForActiveTheme(theme: ShikiThemeId) {
      const cached = getCachedHighlightHtml(theme, language, normalized)

      if (cached) {
        applyResolvedHtml(cached)
        return
      }

      if (initialHtml && theme === initialTheme) {
        applyResolvedHtml(initialHtml)
        return
      }

      void highlightCodeCached(normalized, language, theme).then(applyResolvedHtml)
    }

    resolveForActiveTheme(readDocumentShikiTheme())

    function handleThemeChange() {
      if (cancelled || requestId !== requestIdRef.current) {
        return
      }
      resolveForActiveTheme(readDocumentShikiTheme())
    }

    window.addEventListener(SHIKI_THEME_CHANGED_EVENT, handleThemeChange)

    return () => {
      cancelled = true
      window.removeEventListener(SHIKI_THEME_CHANGED_EVENT, handleThemeChange)
    }
  }, [normalized, language, navigationKey, initialHtml, initialTheme, paint])

  return (
    <div className="code-block">
      <CodeBlockCopyButton code={normalized} />
      <div
        ref={bodyRef}
        className="code-block-body"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: initialHtml || getCachedHighlightHtml(initialTheme, language, normalized) || fallbackHtml(normalized),
        }}
      />
    </div>
  )
}
