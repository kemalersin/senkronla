'use client'

import { useTranslations } from 'next-intl'
import { clearHighlightCache } from '@/lib/highlight-code-cache'
import { notifyShikiThemeChange } from '@/lib/shiki-theme'

const STORAGE_KEY = 'senkronla-theme'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}

function readTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function ThemeToggle() {
  const t = useTranslations('theme')

  function toggle() {
    const next = readTheme() === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    localStorage.setItem(STORAGE_KEY, next)
    document.cookie = `${STORAGE_KEY}=${next};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`
    clearHighlightCache()
    notifyShikiThemeChange()
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={t('toggle')}>
      <span className="theme-toggle-icon theme-toggle-icon-moon" aria-hidden="true">
        <MoonIcon />
      </span>
      <span className="theme-toggle-icon theme-toggle-icon-sun" aria-hidden="true">
        <SunIcon />
      </span>
    </button>
  )
}
