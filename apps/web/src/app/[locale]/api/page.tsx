import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CodeBlock } from '@/components/code-block'
import { DocCallout } from '@/components/doc-callout'
import { DocEndpointHeading, DocHttpExample } from '@/components/doc-http-example'
import { DocSection } from '@/components/doc-section'
import { DocStepList } from '@/components/doc-step-list'
import { DocTag } from '@/components/doc-tag'
import { DocsLayout } from '@/components/docs-layout'
import { DocsTable } from '@/components/docs-table'
import { createApiSnippets } from '@/lib/doc-snippets'
import { withDocRich } from '@/lib/doc-rich-text'
import {
  getPublicApiOrigin,
  getRelayApiBaseUrl,
  getRelayNotificationsWebSocketUrl,
} from '@/lib/public-api-url'

interface PageProps {
  params: Promise<{ locale: string }>
}

const sectionKeys = [
  'overview',
  'auth',
  'workflows',
  'namespaces',
  'documents',
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
  const relayApiBaseUrl = getRelayApiBaseUrl()
  const apiOrigin = getPublicApiOrigin()
  const apiSnippets = createApiSnippets(relayApiBaseUrl)

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

  const exampleProps = {
    requestLabel: t('table.request'),
    responseLabel: t('table.response'),
  }

  return (
    <DocsLayout title={t('title')} intro={t.rich('intro', withDocRich())} nav={nav}>
      <DocSection id="overview" title={t('sections.overview.title')}>
        <p>{t.rich('sections.overview.p1', withDocRich())}</p>
        <p>{t.rich('sections.overview.p2', withDocRich())}</p>
        <CodeBlock
          code={`Base URL: ${relayApiBaseUrl}\nHealth: ${apiOrigin}/health\nContent-Type: application/json`}
          language="http"
        />
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
            ['GET', <DocTag key="meta">.../documents/primary/head/meta</DocTag>, t('sections.documents.meta')],
            ['GET', <DocTag key="head">.../documents/primary/head</DocTag>, t('sections.documents.head')],
            ['PUT', <DocTag key="put">.../documents/primary</DocTag>, t('sections.documents.put')],
          ]}
          tagFirstColumn={false}
        />
        <p>{t.rich('sections.documents.p2', withDocRich())}</p>
        <p>{t.rich('sections.documents.p3', withDocRich())}</p>
        <DocEndpointHeading label={t('sections.documents.metaExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.getDocumentHeadMeta} />
        <DocEndpointHeading label={t('sections.documents.headExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.getDocumentHead} />
        <DocEndpointHeading label={t('sections.documents.pushFirstExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.pushDocumentFirst} />
        <DocEndpointHeading label={t('sections.documents.pushUpdateExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.pushDocumentUpdate} />
        <DocEndpointHeading label={t('sections.documents.conflictExample')} />
        <DocHttpExample {...exampleProps} {...apiSnippets.revisionConflict} />
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
        <p className="doc-subheading">{t('sections.relayQuotas.rateTitle')}</p>
        <p>{t.rich('sections.relayQuotas.rateP1', withDocRich())}</p>
        <DocsTable
          headers={[t('table.quota'), t('table.default'), t('table.scope'), t('table.window')]}
          rows={quotaRows}
          tagFirstColumn={false}
        />
        <p className="doc-subheading">{t('sections.relayQuotas.responseTitle')}</p>
        <p>{t.rich('sections.relayQuotas.responseP1', withDocRich())}</p>
        <p>{t.rich('sections.relayQuotas.responseP2', withDocRich())}</p>
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
