'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MiniSearch from 'minisearch'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { SearchDocument, SearchIndexFile } from '@/lib/search-index'

interface DocSearchDialogProps {
  locale: string
}

interface SearchHit extends SearchDocument {
  score: number
}

function useSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpen()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onOpen])
}

function formatShortcut(isMac: boolean): string {
  return isMac ? '⌘K' : 'Ctrl+K'
}

function lockPageScroll() {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
  const previousBodyPaddingRight = document.body.style.paddingRight
  const header = document.querySelector('.site-header')
  const previousHeaderPaddingRight =
    header instanceof HTMLElement ? header.style.paddingRight : ''

  let spacer: HTMLDivElement | null = null
  if (header instanceof HTMLElement) {
    spacer = document.createElement('div')
    spacer.setAttribute('aria-hidden', 'true')
    spacer.className = 'doc-search-header-spacer'
    spacer.style.height = `${header.getBoundingClientRect().height}px`
    header.insertAdjacentElement('afterend', spacer)
  }

  document.documentElement.classList.add('doc-search-locked')
  if (scrollbarWidth > 0) {
    document.body.style.paddingRight = `${scrollbarWidth}px`
    if (header instanceof HTMLElement) {
      header.style.paddingRight = `${scrollbarWidth}px`
    }
  }

  function preventBackgroundScroll(event: Event) {
    const target = event.target
    if (!(target instanceof Node)) {
      return
    }

    const dialog = document.querySelector('.doc-search-dialog')
    if (dialog?.contains(target)) {
      return
    }

    event.preventDefault()
  }

  document.addEventListener('wheel', preventBackgroundScroll, { passive: false, capture: true })
  document.addEventListener('touchmove', preventBackgroundScroll, { passive: false, capture: true })

  return () => {
    spacer?.remove()
    document.documentElement.classList.remove('doc-search-locked')
    document.body.style.paddingRight = previousBodyPaddingRight
    if (header instanceof HTMLElement) {
      header.style.paddingRight = previousHeaderPaddingRight
    }
    document.removeEventListener('wheel', preventBackgroundScroll, { capture: true })
    document.removeEventListener('touchmove', preventBackgroundScroll, { capture: true })
  }
}

export function DocSearchDialog({ locale }: DocSearchDialogProps) {
  const t = useTranslations('search')
  const router = useRouter()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [index, setIndex] = useState<MiniSearch<SearchDocument> | null>(null)
  const [isMac, setIsMac] = useState(true)

  const openDialog = useCallback(() => {
    setOpen(true)
    setActiveIndex(0)
  }, [])

  const closeDialog = useCallback(() => {
    setOpen(false)
  }, [])

  useSearchShortcut(openDialog)

  useEffect(() => {
    if (!open) {
      return
    }

    return lockPageScroll()
  }, [open])

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform))
  }, [])

  useEffect(() => {
    setIndex(null)
  }, [locale])

  useEffect(() => {
    if (!open || index) {
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`/search/${locale}.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Search index not found')
        }
        return response.json() as Promise<SearchIndexFile>
      })
      .then((payload) => {
        if (cancelled) {
          return
        }

        const miniSearch = new MiniSearch<SearchDocument>({
          fields: ['title', 'page', 'section', 'body'],
          storeFields: ['id', 'title', 'page', 'section', 'href', 'body'],
          searchOptions: {
            boost: { title: 4, section: 2, page: 1.5 },
            prefix: true,
            fuzzy: 0.15,
          },
        })

        miniSearch.addAll(payload.documents)
        setIndex(miniSearch)
      })
      .catch(() => {
        if (!cancelled) {
          setIndex(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, index, locale])

  useEffect(() => {
    if (!open) {
      return
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  const results = useMemo<SearchHit[]>(() => {
    if (!index || !query.trim()) {
      return []
    }

    return index
      .search(query.trim(), { combineWith: 'AND' })
      .slice(0, 12)
      .map((result) => ({
        id: String(result.id),
        title: String(result.title),
        page: String(result.page),
        section: String(result.section),
        href: String(result.href),
        body: String(result.body),
        score: result.score,
      }))
  }, [index, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function navigateTo(href: string) {
    setOpen(false)
    router.push(href)
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDialog()
      return
    }

    if (results.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % results.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + results.length) % results.length)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const hit = results[activeIndex]
      if (hit) {
        navigateTo(hit.href)
      }
    }
  }

  useEffect(() => {
    if (!listRef.current) {
      return
    }

    const activeItem = listRef.current.querySelector('[data-active="true"]')
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, results])

  const dialog = open ? (
    <div className="doc-search-overlay" role="presentation" onClick={closeDialog}>
      <div
        className="doc-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('triggerLabel')}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="doc-search-input-row">
          <label htmlFor={inputId} className="visually-hidden">
            {t('placeholder')}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            className="doc-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={t('placeholder')}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="doc-search-close" onClick={closeDialog} aria-label={t('close')}>
            Esc
          </button>
        </div>

        <div className="doc-search-results" aria-live="polite">
          {loading && <p className="doc-search-empty">{t('loading')}</p>}

          {!loading && query.trim() && results.length === 0 && (
            <p className="doc-search-empty">{t('noResults')}</p>
          )}

          {!loading && !query.trim() && <p className="doc-search-empty">{t('hint')}</p>}

          {!loading && results.length > 0 && (
            <ul ref={listRef} className="doc-search-list">
              {results.map((hit, index) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    className="doc-search-result"
                    data-active={index === activeIndex ? 'true' : 'false'}
                    onClick={() => navigateTo(hit.href)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="doc-search-result-title">{hit.title}</span>
                    <span className="doc-search-result-meta">
                      {hit.page}
                      {hit.section ? ` · ${hit.section}` : ''}
                    </span>
                    <span className="doc-search-result-snippet">{snippet(hit.body, query)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      <button type="button" className="doc-search-trigger" onClick={openDialog} aria-label={t('triggerLabel')}>
        <span className="doc-search-trigger-label">{t('triggerLabel')}</span>
        <kbd className="doc-search-kbd">{formatShortcut(isMac)}</kbd>
      </button>

      {typeof document !== 'undefined' && dialog ? createPortal(dialog, document.body) : null}
    </>
  )
}

function snippet(body: string, query: string): string {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  const lowerBody = body.toLowerCase()
  let index = -1

  for (const term of terms) {
    const found = lowerBody.indexOf(term)
    if (found !== -1 && (index === -1 || found < index)) {
      index = found
    }
  }

  if (index === -1) {
    return body.slice(0, 120)
  }

  const start = Math.max(0, index - 40)
  const end = Math.min(body.length, index + 80)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < body.length ? '…' : ''

  return `${prefix}${body.slice(start, end).trim()}${suffix}`
}
