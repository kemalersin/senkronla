import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

interface PageProps {
  params: Promise<{ locale: string }>
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('landing')

  const steps = ['step1', 'step2', 'step3'] as const
  const benefits = ['privacy', 'offline', 'devices'] as const
  const audiences = ['apps', 'teams', 'builders'] as const

  return (
    <>
      <section className="landing-hero">
        <div className="container landing-hero-inner">
          <p className="landing-eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p className="landing-lead">{t('subtitle')}</p>
          <div className="hero-actions">
            <Link href="/guides" className="btn btn-primary">
              {t('ctaPrimary')}
            </Link>
            <Link href="/sdk" className="btn btn-secondary">
              {t('ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>

      <section className="container landing-section">
        <h2 className="landing-section-title">{t('benefitsTitle')}</h2>
        <div className="landing-grid three">
          {benefits.map((key) => (
            <article key={key} className="landing-card">
              <h3>{t(`benefits.${key}.title`)}</h3>
              <p>{t(`benefits.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band">
        <div className="container">
          <h2 className="landing-section-title">{t('howTitle')}</h2>
          <ol className="landing-steps">
            {steps.map((key, index) => (
              <li key={key}>
                <span className="landing-step-num">{index + 1}</span>
                <div>
                  <h3>{t(`how.${key}.title`)}</h3>
                  <p>{t(`how.${key}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container landing-section">
        <h2 className="landing-section-title">{t('audienceTitle')}</h2>
        <div className="landing-grid three">
          {audiences.map((key) => (
            <article key={key} className="landing-card subtle">
              <h3>{t(`audience.${key}.title`)}</h3>
              <p>{t(`audience.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container landing-dev-cta">
        <div className="landing-dev-card">
          <div>
            <h2>{t('devCta.title')}</h2>
            <p>{t('devCta.body')}</p>
          </div>
          <div className="hero-actions">
            <Link href="/guides#checklist" className="btn btn-primary">
              {t('devCta.primary')}
            </Link>
            <Link href="/api" className="btn btn-secondary">
              {t('devCta.secondary')}
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
