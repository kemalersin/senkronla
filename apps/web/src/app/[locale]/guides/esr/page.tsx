import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CodeBlock } from '@/components/code-block'
import { DocCallout } from '@/components/doc-callout'
import { DocSection } from '@/components/doc-section'
import { DocStepList } from '@/components/doc-step-list'
import { DocsLayout } from '@/components/docs-layout'
import { DocsTable } from '@/components/docs-table'
import { Link } from '@/i18n/navigation'
import { createEsrGuideSnippets } from '@/lib/doc-snippets'
import { withDocRich } from '@/lib/doc-rich-text'
import type { Locale } from '@/i18n/config'
import { getExampleRelayApiBaseUrl, getExampleRelayOrigin } from '@/lib/public-api-url'

interface PageProps {
  params: Promise<{ locale: string }>
}

const sectionKeys = [
  'overview',
  'prerequisites',
  'docker',
  'local',
  'config',
  'verify',
  'production',
  'next',
] as const

export default async function EsrGuidePage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('esrGuide')
  const localeKey = locale as Locale
  const exampleOrigin = getExampleRelayOrigin(localeKey)
  const relayUrl = getExampleRelayApiBaseUrl(localeKey)
  const snippets = createEsrGuideSnippets(exampleOrigin)
  const specHref =
    locale === 'tr'
      ? 'https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/tr/16-APP-REGISTRY.md'
      : 'https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/en/16-APP-REGISTRY.md'
  const rich = withDocRich({
    relayUrl,
    specLink: (chunks) => (
      <a href={specHref} target="_blank" rel="noopener noreferrer">
        {chunks}
      </a>
    ),
  })

  const nav = sectionKeys.map((key) => ({
    id: key,
    label: t(`nav.${key}`),
  }))

  const configRows = [
    ['ESR_DATABASE_URL', t('sections.config.rows.database')],
    ['ESR_PUBLIC_URL', t('sections.config.rows.publicUrl')],
    ['ESR_ADMIN_TOKEN', t('sections.config.rows.adminToken')],
    ['ESR_BLOB_PATH', t('sections.config.rows.blobPath')],
    ['ESR_DEFAULT_FREE_DEVICE_LIMIT', t('sections.config.rows.freeLimit')],
    ['ESR_ON_LIMIT_MODE', t.rich('sections.config.rows.limitMode', rich)],
    ['ESR_CORS_ORIGINS', t.rich('sections.config.rows.cors', rich)],
    ['ESR_MAX_DOCUMENTS_PER_NAMESPACE', t('sections.config.rows.maxDocuments')],
    ['ESR_ALLOWED_DOCUMENT_IDS', t('sections.config.rows.allowedDocIds')],
    ['ESR_APPS__ENABLED', t('sections.config.rows.appsEnabled')],
    ['ESR_APPS__REGISTRATION_MODE', t.rich('sections.config.rows.appsRegistrationMode', rich)],
    ['ESR_APPS__ALLOW_LOCALHOST_ORIGINS', t.rich('sections.config.rows.appsLocalhost', rich)],
    ['ESR_APPS__NATIVE__REQUIRE_CLIENT_SECRET', t.rich('sections.config.rows.appsNativeSecret', rich)],
    ['ESR_APPS__NATIVE__REQUIRE_MANUAL_REVIEW', t.rich('sections.config.rows.appsNativeReview', rich)],
    ['ESR_DEVELOPER_JWT_SECRET', t.rich('sections.config.rows.developerJwt', rich)],
  ]

  const dockerSteps = [1, 2, 3].map((n) => ({
    title: t(`sections.docker.steps.s${n}.title`),
    body: t.rich(`sections.docker.steps.s${n}.body`, rich),
  }))

  const localSteps = [1, 2, 3, 4].map((n) => ({
    title: t(`sections.local.steps.s${n}.title`),
    body: t.rich(`sections.local.steps.s${n}.body`, rich),
  }))

  const verifySteps = [1, 2, 3].map((n) => ({
    title: t(`sections.verify.steps.s${n}.title`),
    body: t.rich(`sections.verify.steps.s${n}.body`, rich),
  }))

  return (
    <DocsLayout title={t('title')} intro={t.rich('intro', rich)} nav={nav}>
      <DocSection id="overview" title={t('sections.overview.title')}>
        <p>{t.rich('sections.overview.p1', rich)}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.overview.li1', rich)}</li>
          <li>{t('sections.overview.li2')}</li>
          <li>{t('sections.overview.li3')}</li>
        </ul>
      </DocSection>

      <DocSection id="prerequisites" title={t('sections.prerequisites.title')}>
        <p>{t('sections.prerequisites.p1')}</p>
        <ul className="doc-list">
          <li>{t('sections.prerequisites.li1')}</li>
          <li>{t.rich('sections.prerequisites.li2', rich)}</li>
          <li>{t.rich('sections.prerequisites.li3', rich)}</li>
          <li>{t('sections.prerequisites.li4')}</li>
        </ul>
      </DocSection>

      <DocSection id="docker" title={t('sections.docker.title')}>
        <p>{t('sections.docker.p1')}</p>
        <DocStepList steps={dockerSteps} />
        <p className="doc-subheading">{t('sections.docker.bundledTitle')}</p>
        <CodeBlock code={`${snippets.dockerEnv}\n\n${snippets.dockerBundled}`} language="bash" />
        <p className="doc-subheading">{t('sections.docker.externalTitle')}</p>
        <p>{t.rich('sections.docker.externalP1', rich)}</p>
        <CodeBlock code={snippets.dockerExternal} language="bash" />
        <DocCallout variant="tip" title={t('sections.docker.tipTitle')}>
          <p>{t.rich('sections.docker.tipBody', rich)}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="local" title={t('sections.local.title')}>
        <p>{t('sections.local.p1')}</p>
        <DocStepList steps={localSteps} />
        <CodeBlock code={`${snippets.localPostgres}\n\n${snippets.localDev}`} language="bash" />
        <p>{t.rich('sections.local.p2', rich)}</p>
      </DocSection>

      <DocSection id="config" title={t('sections.config.title')}>
        <p>{t.rich('sections.config.p1', rich)}</p>
        <DocsTable headers={[t('table.variable'), t('table.purpose')]} rows={configRows} />
        <DocCallout variant="warn" title={t('sections.config.warnTitle')}>
          <p>{t.rich('sections.config.warnBody', rich)}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="verify" title={t('sections.verify.title')}>
        <p>{t('sections.verify.p1')}</p>
        <DocStepList steps={verifySteps} />
        <CodeBlock code={snippets.healthCheck} language="bash" />
        <p>{t.rich('sections.verify.p2', rich)}</p>
      </DocSection>

      <DocSection id="production" title={t('sections.production.title')}>
        <p>{t('sections.production.p1')}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.production.li1', rich)}</li>
          <li>{t.rich('sections.production.li2', rich)}</li>
          <li>{t.rich('sections.production.li3', rich)}</li>
          <li>{t.rich('sections.production.li4', rich)}</li>
          <li>{t.rich('sections.production.li5', rich)}</li>
        </ul>
        <p className="doc-subheading">{t('sections.production.operatorTitle')}</p>
        <p>{t.rich('sections.production.operatorBody', rich)}</p>
        <CodeBlock code={snippets.unlockCode} language="bash" />
      </DocSection>

      <DocSection id="next" title={t('sections.next.title')}>
        <p>{t('sections.next.p1')}</p>
        <p>
          <Link href="/guides">{t('sections.next.integrationLink')}</Link>
          {' · '}
          <Link href="/sdk">{t('sections.next.sdkLink')}</Link>
          {' · '}
          <Link href="/api">{t('sections.next.apiLink')}</Link>
        </p>
      </DocSection>
    </DocsLayout>
  )
}
