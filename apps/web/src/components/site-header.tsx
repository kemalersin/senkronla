'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import type { Locale } from '@/i18n/config'
import { ThemeToggle } from '@/components/theme-toggle'

interface SiteHeaderProps {
  locale: Locale
}

export function SiteHeader({ locale }: SiteHeaderProps) {
  const t = useTranslations('nav')
  const tLocale = useTranslations('locale')
  const pathname = usePathname()

  const links = [
    { href: '/', label: t('home') },
    { href: '/guides', label: t('guides') },
    { href: '/sdk', label: t('sdk') },
    { href: '/api', label: t('api') },
  ]

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link href="/" className="logo">
          senkron<span>la</span>
        </Link>

        <nav className="nav" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-active={
                pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
                  ? 'true'
                  : 'false'
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <ThemeToggle />
          <div className="locale-switch" aria-label="Language">
            {(['en', 'tr'] as const).map((code) => (
              <Link
                key={code}
                href={pathname}
                locale={code}
                data-active={locale === code ? 'true' : 'false'}
              >
                {tLocale(code)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
