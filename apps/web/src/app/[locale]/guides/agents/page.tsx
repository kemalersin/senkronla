import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DocCallout } from '@/components/doc-callout'
import { DocSection } from '@/components/doc-section'
import { DocStepList } from '@/components/doc-step-list'
import { DocsLayout } from '@/components/docs-layout'
import { Link } from '@/i18n/navigation'
import { AGENT_DOC_PATHS, LLMS_TXT_PATH } from '@/lib/site-links'
import { withDocRich } from '@/lib/doc-rich-text'

interface PageProps {
  params: Promise<{ locale: string }>
}

const sectionKeys = ['overview', 'standards', 'files', 'usage', 'scope', 'next'] as const

export default async function AgentsGuidePage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('agentsGuide')
  const rich = withDocRich()

  const nav = sectionKeys.map((key) => ({
    id: key,
    label: t(`nav.${key}`),
  }))

  const usageSteps = [1, 2, 3, 4].map((n) => ({
    title: t(`sections.usage.steps.s${n}.title`),
    body: t.rich(`sections.usage.steps.s${n}.body`, rich),
  }))

  return (
    <DocsLayout title={t('title')} intro={t('intro')} nav={nav}>
      <DocSection id="overview" title={t('sections.overview.title')}>
        <p>{t('sections.overview.p1')}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.overview.li1', rich)}</li>
          <li>{t.rich('sections.overview.li2', rich)}</li>
          <li>{t.rich('sections.overview.li3', rich)}</li>
        </ul>
      </DocSection>

      <DocSection id="standards" title={t('sections.standards.title')}>
        <p>{t('sections.standards.p1')}</p>
        <p className="doc-subheading">{t('sections.standards.llmsTitle')}</p>
        <p>{t.rich('sections.standards.llmsBody', rich)}</p>
        <p className="doc-subheading">{t('sections.standards.agentsMdTitle')}</p>
        <p>{t.rich('sections.standards.agentsMdBody', rich)}</p>
        <DocCallout variant="info" title={t('sections.standards.calloutTitle')}>
          <p>{t('sections.standards.calloutBody')}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="files" title={t('sections.files.title')}>
        <p>{t('sections.files.p1')}</p>
        <ul className="doc-list">
          <li>
            <a href={AGENT_DOC_PATHS.en}>{t('sections.files.enLink')}</a>
            {' — '}
            {t('sections.files.enDesc')}
          </li>
          <li>
            <a href={AGENT_DOC_PATHS.tr}>{t('sections.files.trLink')}</a>
            {' — '}
            {t('sections.files.trDesc')}
          </li>
          <li>
            <a href={LLMS_TXT_PATH}>{t('sections.files.llmsLink')}</a>
            {' — '}
            {t('sections.files.llmsDesc')}
          </li>
        </ul>
        <p>{t('sections.files.p2')}</p>
      </DocSection>

      <DocSection id="usage" title={t('sections.usage.title')}>
        <p>{t('sections.usage.p1')}</p>
        <DocStepList steps={usageSteps} />
      </DocSection>

      <DocSection id="scope" title={t('sections.scope.title')}>
        <p>{t('sections.scope.p1')}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.scope.li1', rich)}</li>
          <li>{t.rich('sections.scope.li2', rich)}</li>
          <li>{t.rich('sections.scope.li3', rich)}</li>
          <li>{t.rich('sections.scope.li4', rich)}</li>
        </ul>
        <p>{t('sections.scope.p2')}</p>
      </DocSection>

      <DocSection id="next" title={t('sections.next.title')}>
        <p>{t('sections.next.p1')}</p>
        <p>
          <Link href="/guides">{t('sections.next.guidesLink')}</Link>
          {' · '}
          <Link href="/sdk">{t('sections.next.sdkLink')}</Link>
          {' · '}
          <Link href="/api">{t('sections.next.apiLink')}</Link>
        </p>
      </DocSection>
    </DocsLayout>
  )
}
