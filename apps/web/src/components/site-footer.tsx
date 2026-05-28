import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

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
            <Link href="/sdk">{t('sdk')}</Link>
            <Link href="/api">{t('api')}</Link>
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Senkronla</span>
      </div>
    </footer>
  )
}
