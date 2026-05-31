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
import { createPageMetadata } from '@/lib/page-metadata'
import { getExampleRelayApiBaseUrl, getExampleRelayOrigin } from '@/lib/public-api-url'

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params
  return createPageMetadata(locale, 'guidesEsr')
}

const sectionKeys = [
  'overview',
  'prerequisites',
  'docker',
  'local',
  'config',
  'rateLimits',
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
  const limitsSpecHref =
    locale === 'tr'
      ? 'https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/tr/17-OPERATOR-LIMIT-OVERRIDES.md'
      : 'https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/en/17-OPERATOR-LIMIT-OVERRIDES.md'
  const rich = withDocRich({
    relayUrl,
    specLink: (chunks) => (
      <a href={specHref} target="_blank" rel="noopener noreferrer">
        {chunks}
      </a>
    ),
    limitsSpecLink: (chunks) => (
      <a href={limitsSpecHref} target="_blank" rel="noopener noreferrer">
        {chunks}
      </a>
    ),
    apiLink: (chunks) => <Link href="/api#relayQuotas">{chunks}</Link>,
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
    ['ESR_APPS__ENABLED', t.rich('sections.config.rows.appsEnabled', rich)],
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

  const rateLimitDefaultRows = (
    ['general', 'push', 'pair', 'pairingToken', 'recover', 'namespaceCreate'] as const
  ).map((key) => [
    t.rich(`sections.rateLimits.rows.${key}`, rich),
    t(`sections.rateLimits.defaults.${key}`),
    t(`sections.rateLimits.scopes.${key}`),
    t(`sections.rateLimits.windows.${key}`),
  ])

  const rateLimitConfigRows = [
    ['ESR_RATE_LIMIT_ENABLED', t.rich('sections.rateLimits.configRows.enabled', rich)],
    ['ESR_RECOVER_PER_HOUR', t('sections.rateLimits.configRows.recoverPerHour')],
    ['ESR_PAIRING_PER_HOUR', t('sections.rateLimits.configRows.pairingPerHour')],
    ['ESR_PAIRING_TOKENS_PER_HOUR', t('sections.rateLimits.configRows.pairingTokensPerHour')],
    ['ESR_PUSH_PER_HOUR_PER_DEVICE', t('sections.rateLimits.configRows.pushPerHourPerDevice')],
    ['ESR_GENERAL_PER_MINUTE_PER_IP', t.rich('sections.rateLimits.configRows.generalPerMinutePerIp', rich)],
    ['ESR_TRUST_PROXY', t.rich('sections.rateLimits.configRows.trustProxy', rich)],
  ]

  const rateLimitAppConfigRows = [
    [
      'ESR_APPS__LIMITS__PER_APP__NAMESPACES_PER_DAY',
      t.rich('sections.rateLimits.appConfigRows.namespacesPerDay', rich),
    ],
    [
      'ESR_APPS__LIMITS__PER_APP__RECOVER_PER_HOUR',
      t('sections.rateLimits.appConfigRows.recoverPerHour'),
    ],
    [
      'ESR_APPS__LIMITS__PER_APP__PAIRING_TOKENS_PER_HOUR',
      t('sections.rateLimits.appConfigRows.pairingTokensPerHour'),
    ],
  ]

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

      <DocSection id="rateLimits" title={t('sections.rateLimits.title')}>
        <p>{t.rich('sections.rateLimits.p1', rich)}</p>
        <p>{t.rich('sections.rateLimits.p2', rich)}</p>
        <p className="doc-subheading">{t('sections.rateLimits.defaultsTitle')}</p>
        <DocsTable
          headers={[t('table.quota'), t('table.default'), t('table.scope'), t('table.window')]}
          rows={rateLimitDefaultRows}
          tagFirstColumn={false}
        />
        <p className="doc-subheading">{t('sections.rateLimits.configTitle')}</p>
        <p>{t.rich('sections.rateLimits.configP1', rich)}</p>
        <CodeBlock code={snippets.rateLimitConfig} language="yaml" />
        <DocsTable headers={[t('table.variable'), t('table.purpose')]} rows={rateLimitConfigRows} />
        <DocCallout variant="tip" title={t('sections.rateLimits.trustTitle')}>
          <p>{t.rich('sections.rateLimits.trustBody', rich)}</p>
        </DocCallout>
        <p className="doc-subheading">{t('sections.rateLimits.appsTitle')}</p>
        <p>{t.rich('sections.rateLimits.appsP1', rich)}</p>
        <DocsTable headers={[t('table.variable'), t('table.purpose')]} rows={rateLimitAppConfigRows} />
        <p className="doc-subheading">{t('sections.rateLimits.overridesTitle')}</p>
        <p>{t.rich('sections.rateLimits.overridesP1', rich)}</p>
        <p className="doc-subheading">{t('sections.rateLimits.monitorTitle')}</p>
        <p>{t.rich('sections.rateLimits.monitorP1', rich)}</p>
        <p className="doc-subheading">{t('sections.rateLimits.clientTitle')}</p>
        <p>{t.rich('sections.rateLimits.clientP1', rich)}</p>
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
