'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import type { Locale } from '@/i18n/config'
import { ThemeToggle } from '@/components/theme-toggle'
import { DocSearchDialog, DocSearchTrigger } from '@/components/doc-search-dialog'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'
import { useDeveloperSession } from '@/hooks/use-developer-session'
import { OVERLAY_OPEN_EVENT } from '@/lib/page-scroll-lock'
import { GITHUB_REPO_URL } from '@/lib/site-links'

interface SiteHeaderProps {
  locale: Locale
  initialDeveloperAuthenticated?: boolean
  developerPortalEnabled?: boolean
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function SiteHeader({
  locale,
  initialDeveloperAuthenticated = false,
  developerPortalEnabled = false,
}: SiteHeaderProps) {
  const t = useTranslations('nav')
  const tLocale = useTranslations('locale')
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const developerAuthenticated = useDeveloperSession(initialDeveloperAuthenticated)

  usePageScrollLock(menuOpen, 'site-menu')

  useEffect(() => {
    function closeMenu() {
      setMenuOpen(false)
    }

    window.addEventListener(OVERLAY_OPEN_EVENT, closeMenu)
    return () => window.removeEventListener(OVERLAY_OPEN_EVENT, closeMenu)
  }, [])

  const links = [
    { href: '/', label: t('home') },
    { href: '/guides', label: t('guides') },
    { href: '/guides/esr', label: t('esr') },
    { href: '/guides/agents', label: t('agents') },
    { href: '/sdk', label: t('sdk') },
    { href: '/api', label: t('api') },
  ]

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  function isLinkActive(href: string) {
    return pathname === href || (href !== '/' && pathname.startsWith(href))
  }

  function renderNav(className: string, onNavigate?: () => void) {
    return (
      <nav className={className} aria-label="Main">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            data-active={isLinkActive(link.href) ? 'true' : 'false'}
            onClick={onNavigate}
          >
            {link.label}
          </Link>
        ))}
        {developerPortalEnabled &&
          (!developerAuthenticated ? (
            <Link
              href="/developer"
              className="header-login-link"
              data-active={pathname.startsWith('/developer') ? 'true' : 'false'}
              onClick={onNavigate}
            >
              {t('login')}
            </Link>
          ) : (
            <Link
              href="/developer"
              className="header-login-link"
              data-active={pathname.startsWith('/developer') ? 'true' : 'false'}
              onClick={onNavigate}
            >
              {t('panel')}
            </Link>
          ))}
      </nav>
    )
  }

  function renderUtilities() {
    return (
      <>
        <DocSearchTrigger />
        <a
          href={GITHUB_REPO_URL}
          className="header-github-link"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('github')}
        >
          <GitHubIcon />
        </a>
        <ThemeToggle />
        <div className="locale-switch" aria-label="Language">
          {(['en', 'tr'] as const).map((code) => (
            <Link
              key={code}
              href={pathname}
              locale={code}
              prefetch={false}
              data-active={locale === code ? 'true' : 'false'}
            >
              {tLocale(code)}
            </Link>
          ))}
        </div>
      </>
    )
  }

  return (
    <header className="site-header">
      <DocSearchDialog locale={locale} />

      <div className="container site-header-inner">
        <Link href="/" className="logo">
          senkron<span>la</span>
        </Link>

        {renderNav('nav site-header-nav')}

        <div className="header-actions site-header-utilities">{renderUtilities()}</div>

        <div className="header-mobile-controls">
          <button
            type="button"
            className="header-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="site-header-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
            <span className="visually-hidden">{menuOpen ? t('menuClose') : t('menuOpen')}</span>
          </button>
        </div>
      </div>

      {menuOpen && typeof document !== 'undefined'
        ? createPortal(
            <>
              <button
                type="button"
                className="site-header-menu-backdrop"
                aria-label={t('menuClose')}
                onClick={() => setMenuOpen(false)}
              />
              <div
                id="site-header-menu"
                className="site-header-mobile-menu"
                role="dialog"
                aria-modal="true"
                aria-label={t('menuOpen')}
              >
                <div className="container site-header-mobile-menu-inner">
                  {renderNav('nav site-header-mobile-nav', () => setMenuOpen(false))}
                  <div className="header-actions site-header-mobile-utilities">
                    {renderUtilities()}
                  </div>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </header>
  )
}
