'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { DONATE_URL, GITHUB_REPO_URL } from '@/lib/site-links'

export function SiteFooter() {
  const t = useTranslations('footer')

  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <div className="footer-brand">
          <span className="logo">senkron<span>la</span></span>
          <p>{t('tagline')}</p>
        </div>

        <div className="footer-links">
          <div>
            <h4>{t('developers')}</h4>
            <Link href="/guides">{t('guides')}</Link>
            <p className="footer-inline-links">
              <Link href="/guides/esr">{t('esr')}</Link>
              <span aria-hidden="true">·</span>
              <Link href="/guides/agents">{t('agents')}</Link>
              <span aria-hidden="true">·</span>
              <Link href="/sdk">{t('sdk')}</Link>
              <span aria-hidden="true">·</span>
              <Link href="/api">{t('api')}</Link>
            </p>
          </div>
          <div>
            <h4>{t('project')}</h4>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              {t('github')}
            </a>
            <a href={DONATE_URL} target="_blank" rel="noopener noreferrer">
              {t('donate')}
            </a>
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Senkronla</span>
        <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
          {t('github')}
        </a>
      </div>
    </footer>
  )
}
