import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DocAgentFiles } from '@/components/doc-agent-files'
import { DocCallout } from '@/components/doc-callout'
import { DocSection } from '@/components/doc-section'
import { DocStepList } from '@/components/doc-step-list'
import { DocsLayout } from '@/components/docs-layout'
import { Link } from '@/i18n/navigation'
import { AGENT_API_PATHS, AGENT_DOC_PATHS, AGENT_SDK_PATHS, LLMS_TXT_PATH } from '@/lib/site-links'
import { withDocRich } from '@/lib/doc-rich-text'
import { createPageMetadata } from '@/lib/page-metadata'

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params
  return createPageMetadata(locale, 'guidesAgents')
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

  const agentFileGroups = [
    {
      id: 'overview',
      title: t('sections.files.overviewTitle'),
      items: [
        {
          href: AGENT_DOC_PATHS.en,
          path: t('sections.files.enLink'),
          langLabel: t('sections.files.langEn'),
          description: t('sections.files.enDesc'),
        },
        {
          href: AGENT_DOC_PATHS.tr,
          path: t('sections.files.trLink'),
          langLabel: t('sections.files.langTr'),
          description: t('sections.files.trDesc'),
        },
      ],
    },
    {
      id: 'sdk',
      title: t('sections.files.sdkTitle'),
      items: [
        {
          href: AGENT_SDK_PATHS.en,
          path: t('sections.files.sdkEnLink'),
          langLabel: t('sections.files.langEn'),
          description: t('sections.files.sdkEnDesc'),
        },
        {
          href: AGENT_SDK_PATHS.tr,
          path: t('sections.files.sdkTrLink'),
          langLabel: t('sections.files.langTr'),
          description: t('sections.files.sdkTrDesc'),
        },
      ],
    },
    {
      id: 'api',
      title: t('sections.files.apiTitle'),
      items: [
        {
          href: AGENT_API_PATHS.en,
          path: t('sections.files.apiEnLink'),
          langLabel: t('sections.files.langEn'),
          description: t('sections.files.apiEnDesc'),
        },
        {
          href: AGENT_API_PATHS.tr,
          path: t('sections.files.apiTrLink'),
          langLabel: t('sections.files.langTr'),
          description: t('sections.files.apiTrDesc'),
        },
      ],
    },
    {
      id: 'manifest',
      title: t('sections.files.llmsTitle'),
      items: [
        {
          href: LLMS_TXT_PATH,
          path: t('sections.files.llmsLink'),
          langLabel: t('sections.files.langAny'),
          description: t('sections.files.llmsDesc'),
        },
      ],
    },
  ]

  const recommendedSteps = [1, 2, 3, 4].map((n) =>
    t.rich(`sections.files.recommendedSteps.s${n}`, rich),
  )

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
        <DocAgentFiles
          intro={t('sections.files.p1')}
          originNote={t.rich('sections.files.originNote', rich)}
          groups={agentFileGroups}
          recommendedTitle={t('sections.files.recommendedTitle')}
          recommendedSteps={recommendedSteps}
        />
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
