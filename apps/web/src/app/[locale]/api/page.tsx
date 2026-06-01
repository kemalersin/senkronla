import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CodeBlock } from '@/components/code-block'
import { DocCallout } from '@/components/doc-callout'
import { DocEndpointHeading, DocHttpExample } from '@/components/doc-http-example'
import { DocSection } from '@/components/doc-section'
import { DocStepList } from '@/components/doc-step-list'
import { DocTag } from '@/components/doc-tag'
import { DocsLayout } from '@/components/docs-layout'
import { DocsTable } from '@/components/docs-table'
import { Link } from '@/i18n/navigation'
import { createApiSnippets } from '@/lib/doc-snippets'
import { withDocRich } from '@/lib/doc-rich-text'
import { POSTMAN_ARTIFACT_PATHS } from '@/lib/postman-artifacts'
import { createPageMetadata } from '@/lib/page-metadata'
import {
  getPublicApiOrigin,
  getRelayApiBaseUrl,
  getRelayNotificationsWebSocketUrl,
} from '@/lib/public-api-url'

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params
  return createPageMetadata(locale, 'api')
}

const sectionKeys = [
  'overview',
  'auth',
  'app-registry',
  'workflows',
  'namespaces',
  'documents',
  'encryption',
  'devices',
  'limits',
  'websocket',
  'relayQuotas',
  'errors',
] as const

export default async function ApiPage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('api')
  const tGuides = await getTranslations('guides')
  const relayApiBaseUrl = getRelayApiBaseUrl()
  const apiOrigin = getPublicApiOrigin()
  const apiSnippets = createApiSnippets(relayApiBaseUrl)
  const specHref =
    locale === 'tr'
      ? 'https://github.com/kemalersin/senkronla/blob/main/docs/tr/16-APP-REGISTRY.md'
      : 'https://github.com/kemalersin/senkronla/blob/main/docs/en/16-APP-REGISTRY.md'

  const nav = sectionKeys.map((key) => ({
    id: key,
    label: t(`nav.${key}`),
  }))

  const workflowSteps = [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t(`sections.workflows.steps.s${n}.title`),
    body: t.rich(`sections.workflows.steps.s${n}.body`, withDocRich()),
  }))

  const errorRows = [
    ['VALIDATION_ERROR', '400', t.rich('sections.errors.rows.validation', withDocRich())],
    ['DEVICE_TOKEN_INVALID', '401', t.rich('sections.errors.rows.token', withDocRich())],
    ['RECOVERY_INVALID', '401', t.rich('sections.errors.rows.recovery', withDocRich())],
    ['DEVICE_LIMIT_PAYMENT_REQUIRED', '403', t.rich('sections.errors.rows.limitPay', withDocRich())],
    ['DEVICE_LIMIT_BLOCKED', '403', t.rich('sections.errors.rows.limitBlock', withDocRich())],
    ['NAMESPACE_NOT_FOUND', '404', t.rich('sections.errors.rows.notFound', withDocRich())],
    ['DOCUMENT_NOT_FOUND', '404', t.rich('sections.errors.rows.noDocument', withDocRich())],
    ['NAMESPACE_EXISTS', '409', t.rich('sections.errors.rows.exists', withDocRich())],
    ['REVISION_CONFLICT', '409', t.rich('sections.errors.rows.conflict', withDocRich())],
    ['ENVELOPE_TOO_LARGE', '413', t.rich('sections.errors.rows.tooLarge', withDocRich())],
    ['ENVELOPE_INVALID', '422', t.rich('sections.errors.rows.envelope', withDocRich())],
    ['INVALID_DOCUMENT_ID', '400', t.rich('sections.errors.rows.invalidDocumentId', withDocRich())],
    ['DOCUMENT_LIMIT_REACHED', '403', t.rich('sections.errors.rows.documentLimit', withDocRich())],
    ['DOCUMENT_ID_NOT_ALLOWED', '403', t.rich('sections.errors.rows.documentNotAllowed', withDocRich())],
    ['ENVELOPE_DOCUMENT_MISMATCH', '422', t.rich('sections.errors.rows.envelopeDocumentMismatch', withDocRich())],
    ['RATE_LIMIT_EXCEEDED', '429', t.rich('sections.errors.rows.rateLimit', withDocRich())],
    ['PAIRING_CODE_INVALID', '400', t.rich('sections.errors.rows.pairing', withDocRich())],
    ['UNLOCK_CODE_INVALID', '400', t.rich('sections.errors.rows.unlock', withDocRich())],
  ]

  const quotaRows = (['general', 'push', 'pair', 'pairingToken', 'recover'] as const).map((key) => [
    t.rich(`sections.relayQuotas.rows.${key}`, withDocRich()),
    t(`sections.relayQuotas.defaults.${key}`),
    t(`sections.relayQuotas.scopes.${key}`),
    t(`sections.relayQuotas.windows.${key}`),
  ])

  const encryptionRich = withDocRich({
    sdkLink: (chunks) => <Link href="/sdk#encryption">{chunks}</Link>,
  })
  const appRegistryRich = withDocRich({
    apiAppLink: (chunks) => <a href="#app-registry">{chunks}</a>,
    sdkAppLink: (chunks) => <Link href="/sdk#app-registry">{chunks}</Link>,
    specLink: (chunks) => (
      <a href={specHref} target="_blank" rel="noopener noreferrer">
        {chunks}
      </a>
    ),
    developerLink: (chunks) => <Link href="/developer">{chunks}</Link>,
    operatorLink: (chunks) => <Link href="/operator">{chunks}</Link>,
  })

  const appHeaderRows = [
    [t('sections.appRegistry.headers.web'), t.rich('sections.appRegistry.headers.webDesc', withDocRich())],
    [
      t('sections.appRegistry.headers.native'),
      t.rich('sections.appRegistry.headers.nativeDesc', withDocRich()),
    ],
  ]

  const appManagementRows = [
    [
      t('sections.appRegistry.management.operator'),
      '/v1/admin/apps',
      t.rich('sections.appRegistry.management.operatorAuth', withDocRich()),
      t.rich('sections.appRegistry.management.operatorUi', appRegistryRich),
    ],
    [
      t('sections.appRegistry.management.developer'),
      '/v1/developer/*',
      t.rich('sections.appRegistry.management.developerAuth', withDocRich()),
      t.rich('sections.appRegistry.management.developerUi', appRegistryRich),
    ],
  ]

  const appErrorRows = [
    ['APP_ID_REQUIRED', '400', t.rich('sections.appRegistry.errors.appIdRequired', withDocRich())],
    ['APP_ORIGIN_REQUIRED', '400', t.rich('sections.appRegistry.errors.originRequired', withDocRich())],
    ['APP_ORIGIN_NOT_ALLOWED', '403', t.rich('sections.appRegistry.errors.originNotAllowed', withDocRich())],
    ['APP_NAMESPACE_MISMATCH', '403', t.rich('sections.appRegistry.errors.namespaceMismatch', withDocRich())],
    ['APP_NOT_FOUND', '403', t.rich('sections.appRegistry.errors.notFound', withDocRich())],
    ['APP_SUSPENDED', '403', t.rich('sections.appRegistry.errors.suspended', withDocRich())],
    ['APP_PAIRING_NOT_ALLOWED', '403', t.rich('sections.appRegistry.errors.pairingNotAllowed', withDocRich())],
    ['APP_CLIENT_SECRET_INVALID', '401', t.rich('sections.appRegistry.errors.clientSecretInvalid', withDocRich())],
    ['APP_NOT_VERIFIED', '403', t.rich('sections.appRegistry.errors.notVerified', withDocRich())],
    ['APP_NATIVE_ID_REQUIRED', '400', t.rich('sections.appRegistry.errors.nativeIdRequired', withDocRich())],
    ['APP_BUNDLE_NOT_ALLOWED', '403', t.rich('sections.appRegistry.errors.bundleNotAllowed', withDocRich())],
  ]

  const exampleProps = {
    requestLabel: t('table.request'),
    responseLabel: t('table.response'),
  }

  return (
    <DocsLayout title={t('title')} intro={t.rich('intro', withDocRich())} nav={nav}>
      <DocCallout variant="info" title={tGuides('agentsCalloutTitle')}>
        <p>{tGuides('agentsCalloutBody')}</p>
        <p>
          <Link href="/guides/agents">{tGuides('agentsCalloutLink')}</Link>
        </p>
      </DocCallout>

      <DocSection id="overview" title={t('sections.overview.title')}>
        <p>{t.rich('sections.overview.p1', withDocRich())}</p>
        <p>{t.rich('sections.overview.p2', withDocRich())}</p>
        <CodeBlock
          code={`Base URL: ${relayApiBaseUrl}\nHealth: ${apiOrigin}/health\nContent-Type: application/json`}
          language="http"
        />
        <DocCallout variant="tip" title={t('sections.overview.postmanTitle')}>
          <div className="doc-callout-sections">
            <p>{t.rich('sections.overview.postmanBody', withDocRich())}</p>
            <ul className="doc-list doc-callout-links">
              <li>
                <a href={POSTMAN_ARTIFACT_PATHS.collection} download>
                  {t('sections.overview.postmanCollectionLink')}
                </a>
              </li>
              <li>
                <a href={POSTMAN_ARTIFACT_PATHS.localEnvironment} download>
                  {t('sections.overview.postmanLocalEnvLink')}
                </a>
              </li>
              <li>
                <a href={POSTMAN_ARTIFACT_PATHS.productionEnvironment} download>
                  {t('sections.overview.postmanProdEnvLink')}
                </a>
              </li>
            </ul>
            <div className="doc-callout-block">
              <p className="doc-callout-subtitle">{t('sections.overview.postmanStepsTitle')}</p>
              <ol className="doc-list ordered doc-callout-steps">
                <li>{t('sections.overview.postmanStep1')}</li>
                <li>{t.rich('sections.overview.postmanStep2', withDocRich())}</li>
                <li>{t.rich('sections.overview.postmanStep3', withDocRich())}</li>
              </ol>
            </div>
          </div>
        </DocCallout>
        <DocEndpointHeading label={t('sections.overview.healthTitle')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.health} />
        <DocCallout variant="info" title={t('sections.overview.calloutTitle')}>
          <p>{t.rich('sections.overview.calloutBody', withDocRich())}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="auth" title={t('sections.auth.title')}>
        <p>{t.rich('sections.auth.p1', withDocRich())}</p>
        <CodeBlock code={t('code.auth')} language="http" />
        <p>{t('sections.auth.p2')}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.auth.li1', withDocRich())}</li>
          <li>{t.rich('sections.auth.li2', withDocRich())}</li>
        </ul>
        <p>{t.rich('sections.auth.appNote', appRegistryRich)}</p>
      </DocSection>

      <DocSection id="app-registry" title={t('sections.appRegistry.title')}>
        <p>{t.rich('sections.appRegistry.p1', appRegistryRich)}</p>
        <p className="doc-subheading">{t('sections.appRegistry.headersTitle')}</p>
        <DocsTable
          headers={[t('table.clientType'), t('table.headers')]}
          rows={appHeaderRows}
        />
        <p>{t.rich('sections.appRegistry.p2', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.appRegistry.authLayersTitle')}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.appRegistry.authLayersApp', withDocRich())}</li>
          <li>{t.rich('sections.appRegistry.authLayersDevice', withDocRich())}</li>
        </ul>
        <DocStepList
          steps={[1, 2, 3, 4, 5].map((n) => ({
            title: t(`sections.appRegistry.flow.s${n}.title`),
            body: t.rich(`sections.appRegistry.flow.s${n}.body`, appRegistryRich),
          }))}
        />
        <p className="doc-subheading">{t('sections.appRegistry.webExampleTitle')}</p>
        <CodeBlock code={apiSnippets.appHeadersWeb} language="http" />
        <p className="doc-subheading">{t('sections.appRegistry.nativeExampleTitle')}</p>
        <CodeBlock code={apiSnippets.appHeadersNative} language="http" />
        <p className="doc-subheading">{t('sections.appRegistry.managementTitle')}</p>
        <p>{t.rich('sections.appRegistry.managementP1', withDocRich())}</p>
        <DocsTable
          headers={[
            t('sections.appRegistry.management.audience'),
            t('table.path'),
            t('sections.appRegistry.management.auth'),
            t('sections.appRegistry.management.ui'),
          ]}
          rows={appManagementRows}
        />
        <p className="doc-subheading">{t('sections.appRegistry.errorsTitle')}</p>
        <p>{t.rich('sections.appRegistry.errorsP1', appRegistryRich)}</p>
        <DocsTable
          headers={[t('table.code'), t('table.http'), t('table.action')]}
          rows={appErrorRows}
        />
        <DocCallout variant="info" title={t('sections.appRegistry.migrationTitle')}>
          <p>{t.rich('sections.appRegistry.migrationP1', appRegistryRich)}</p>
        </DocCallout>
        <p>{t.rich('sections.appRegistry.p3', appRegistryRich)}</p>
      </DocSection>

      <DocSection id="workflows" title={t('sections.workflows.title')}>
        <p>{t('sections.workflows.p1')}</p>
        <DocStepList steps={workflowSteps} />
      </DocSection>

      <DocSection id="namespaces" title={t('sections.namespaces.title')}>
        <p>{t.rich('sections.namespaces.p1', withDocRich())}</p>
        <DocsTable
          headers={[t('table.method'), t('table.path'), t('table.purpose')]}
          rows={[
            ['POST', '/v1/namespaces', t('sections.namespaces.create')],
            ['GET', '/v1/namespaces/{id}', t('sections.namespaces.get')],
          ]}
        />
        <DocEndpointHeading label={t('sections.namespaces.createExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.createNamespace} />
        <DocEndpointHeading label={t('sections.namespaces.getExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.getNamespace} />
      </DocSection>

      <DocSection id="documents" title={t('sections.documents.title')}>
        <p>{t.rich('sections.documents.p1', withDocRich())}</p>
        <DocsTable
          headers={[t('table.method'), t('table.path'), t('table.purpose')]}
          rows={[
            ['GET', <DocTag key="list">.../documents</DocTag>, t('sections.documents.list')],
            [
              'GET',
              <DocTag key="meta">.../documents/{'{documentId}'}/head/meta</DocTag>,
              t('sections.documents.meta'),
            ],
            ['GET', <DocTag key="head">.../documents/{'{documentId}'}/head</DocTag>, t('sections.documents.head')],
            ['PUT', <DocTag key="put">.../documents/{'{documentId}'}</DocTag>, t('sections.documents.put')],
          ]}
          tagFirstColumn={false}
        />
        <p>{t.rich('sections.documents.parametricPath', withDocRich())}</p>
        <p>
          {t('sections.documents.p2Intro')}{' '}
          <Link href="#encryption">{t('sections.documents.p2Link')}</Link>{' '}
          {t.rich('sections.documents.p2Outro', withDocRich())}
        </p>
        <p>{t.rich('sections.documents.p3', withDocRich())}</p>
        <p>{t.rich('sections.documents.p4', withDocRich())}</p>
        <p>{t.rich('sections.documents.rawDevNote', withDocRich())}</p>
        <DocEndpointHeading label={t('sections.documents.listExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.listDocuments} />
        <DocEndpointHeading label={t('sections.documents.metaExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.getDocumentHeadMeta} />
        <DocEndpointHeading label={t('sections.documents.headExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.getDocumentHead} />
        <DocEndpointHeading label={t('sections.documents.pushCreateExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.pushDocumentCreate} />
        <DocEndpointHeading label={t('sections.documents.pushUpdateExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.pushDocumentUpdate} />
        <DocEndpointHeading label={t('sections.documents.conflictExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.revisionConflict} />
      </DocSection>

      <DocSection id="encryption" title={t('sections.encryption.title')}>
        <p>{t.rich('sections.encryption.p1', encryptionRich)}</p>
        <p className="doc-subheading">{t('sections.encryption.passwordTitle')}</p>
        <p>{t('sections.encryption.passwordP1')}</p>
        <p>{t.rich('sections.encryption.passwordP2', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.encryption.secretsTitle')}</p>
        <ul className="doc-list">
          <li>{t('sections.encryption.secretsRows.syncPassword')}</li>
          <li>{t('sections.encryption.secretsRows.recoveryPhrase')}</li>
          <li>{t('sections.encryption.secretsRows.deviceToken')}</li>
          <li>{t('sections.encryption.secretsRows.demoPassword')}</li>
        </ul>
        <p className="doc-subheading">{t('sections.encryption.payloadTitle')}</p>
        <p>{t.rich('sections.encryption.payloadP1', withDocRich())}</p>
        <CodeBlock code={apiSnippets.envEnc1InnerExample} language="jsonc" />
        <ul className="doc-list">
          <li>{t.rich('sections.encryption.payloadLi1', withDocRich())}</li>
          <li>{t.rich('sections.encryption.payloadLi2', withDocRich())}</li>
          <li>{t.rich('sections.encryption.payloadLi3', withDocRich())}</li>
        </ul>
        <p className="doc-subheading">{t('sections.encryption.buildTitle')}</p>
        <p>{t.rich('sections.encryption.buildP1', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.encryption.buildExampleTitle')}</p>
        <CodeBlock code={apiSnippets.restEnvEnc1Build} language="typescript" />
        <DocCallout variant="warn" title={t('sections.encryption.warnTitle')}>
          <p>{t.rich('sections.encryption.warnBody', withDocRich())}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="devices" title={t('sections.devices.title')}>
        <p>{t('sections.devices.p1')}</p>
        <DocsTable
          headers={[t('table.method'), t('table.path'), t('table.purpose')]}
          rows={[
            ['POST', <DocTag key="pair">.../pairing-tokens</DocTag>, t('sections.devices.pairingToken')],
            ['POST', <DocTag key="devices">.../devices</DocTag>, t('sections.devices.redeem')],
            ['GET', <DocTag key="list">.../devices</DocTag>, t('sections.devices.list')],
            ['DELETE', <DocTag key="revoke">.../devices/{'{deviceId}'}</DocTag>, t('sections.devices.revoke')],
            ['POST', <DocTag key="recover">.../recover</DocTag>, t('sections.devices.recover')],
          ]}
          tagFirstColumn={false}
        />
        <DocEndpointHeading label={t('sections.devices.pairingTokenExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.createPairingToken} />
        <DocEndpointHeading label={t('sections.devices.redeemExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.redeemPairing} />
        <DocEndpointHeading label={t('sections.devices.listExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.listDevices} />
        <DocEndpointHeading label={t('sections.devices.revokeExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.revokeDevice} />
        <DocEndpointHeading label={t('sections.devices.recoverExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.recover} />
        <DocCallout variant="warn" title={t('sections.devices.warnTitle')}>
          <p>{t.rich('sections.devices.warnBody', withDocRich())}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="limits" title={t('sections.limits.title')}>
        <p>{t.rich('sections.limits.p1', withDocRich())}</p>
        <DocsTable
          headers={[t('table.method'), t('table.path'), t('table.purpose')]}
          rows={[
            ['GET', <DocTag key="limits">.../limits</DocTag>, t('sections.limits.get')],
            ['POST', <DocTag key="unlock">.../unlock</DocTag>, t('sections.limits.unlock')],
          ]}
          tagFirstColumn={false}
        />
        <DocEndpointHeading label={t('sections.limits.getExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.getLimits} />
        <DocEndpointHeading label={t('sections.limits.unlockExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.redeemUnlock} />
      </DocSection>

      <DocSection id="websocket" title={t('sections.websocket.title')}>
        <p>{t.rich('sections.websocket.p1', withDocRich())}</p>
        <CodeBlock code={getRelayNotificationsWebSocketUrl()} language="text" />
        <p>{t.rich('sections.websocket.p2', withDocRich())}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.websocket.li1', withDocRich())}</li>
          <li>{t.rich('sections.websocket.li2', withDocRich())}</li>
        </ul>
        <p className="doc-subheading doc-endpoint-heading">{t('sections.websocket.exampleTitle')}</p>
        <DocHttpExample {...exampleProps} {...apiSnippets.websocketConnect} />
      </DocSection>

      <DocSection id="relayQuotas" title={t('sections.relayQuotas.title')}>
        <p>{t.rich('sections.relayQuotas.p1', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.relayQuotas.sizeTitle')}</p>
        <p>{t.rich('sections.relayQuotas.sizeBody', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.relayQuotas.retentionTitle')}</p>
        <p>{t.rich('sections.relayQuotas.retentionBody', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.relayQuotas.rateTitle')}</p>
        <p>{t.rich('sections.relayQuotas.rateP1', withDocRich())}</p>
        <DocsTable
          headers={[t('table.quota'), t('table.default'), t('table.scope'), t('table.window')]}
          rows={quotaRows}
          tagFirstColumn={false}
        />
        <p className="doc-subheading">{t('sections.relayQuotas.responseTitle')}</p>
        <p>{t.rich('sections.relayQuotas.responseIntro', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.relayQuotas.responseHeadersTitle')}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.relayQuotas.responseHeaderGeneral', withDocRich())}</li>
          <li>{t.rich('sections.relayQuotas.responseHeaderPut', withDocRich())}</li>
          <li>{t.rich('sections.relayQuotas.responseHeaderPairRecover', withDocRich())}</li>
        </ul>
        <p className="doc-subheading">{t.rich('sections.relayQuotas.responseJsonTitle', withDocRich())}</p>
        <p>{t.rich('sections.relayQuotas.responseJsonIntro', withDocRich())}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.relayQuotas.responseJsonKeys', withDocRich())}</li>
          <li>{t.rich('sections.relayQuotas.responseJsonFields', withDocRich())}</li>
          <li>{t.rich('sections.relayQuotas.responseJsonPut', withDocRich())}</li>
        </ul>
        <p className="doc-subheading">{t.rich('sections.relayQuotas.responseRoutesTitle', withDocRich())}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.relayQuotas.responseRoutePut', withDocRich())}</li>
          <li>{t.rich('sections.relayQuotas.responseRouteHead', withDocRich())}</li>
          <li>{t.rich('sections.relayQuotas.responseRouteList', withDocRich())}</li>
          <li>{t.rich('sections.relayQuotas.responseRouteRecover', withDocRich())}</li>
          <li>{t.rich('sections.relayQuotas.responseRoutePairingToken', withDocRich())}</li>
          <li>{t.rich('sections.relayQuotas.responseRoutePair', withDocRich())}</li>
        </ul>
        <p className="doc-subheading">{t('sections.relayQuotas.responseRoutesWithoutTitle')}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.relayQuotas.responseRoutesWithout', withDocRich())}</li>
        </ul>
        <p className="doc-subheading">{t.rich('sections.relayQuotas.responseErrorsTitle', withDocRich())}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.relayQuotas.responseErrorRetry', withDocRich())}</li>
          <li>{t.rich('sections.relayQuotas.responseErrorNoTopLevel', withDocRich())}</li>
        </ul>
        <p className="doc-subheading">{t('sections.relayQuotas.responseExampleTitle')}</p>
        <CodeBlock code={apiSnippets.rateLimitResponseShape} language="jsonc" />
      </DocSection>

      <DocSection id="errors" title={t('sections.errors.title')}>
        <p>{t.rich('sections.errors.p1', withDocRich())}</p>
        <DocsTable
          headers={[t('table.code'), t('table.http'), t('table.action')]}
          rows={errorRows}
        />
      </DocSection>
    </DocsLayout>
  )
}
