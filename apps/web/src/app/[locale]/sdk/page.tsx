import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DocTag } from '@/components/doc-tag'
import { CodeBlock } from '@/components/code-block'
import { DocCallout } from '@/components/doc-callout'
import { DocSection } from '@/components/doc-section'
import { DocsLayout } from '@/components/docs-layout'
import { DocsTable } from '@/components/docs-table'
import { Link } from '@/i18n/navigation'
import { createGuideSnippets, SDK_SAMPLE_LEGEND } from '@/lib/doc-snippets'
import { withDocRich } from '@/lib/doc-rich-text'
import { getRelayApiBaseUrl } from '@/lib/public-api-url'

interface PageProps {
  params: Promise<{ locale: string }>
}

const sectionKeys = [
  'integration',
  'quick-start',
  'install',
  'connect',
  'app-registry',
  'multi-document',
  'adapter',
  'encryption',
  'storage',
  'methods',
  'sync',
  'pairing',
  'conflicts',
  'notifications',
  'status',
  'errors',
] as const

const integrationRowKeys = [
  'adapter',
  'namespaceId',
  'recoveryUi',
  'conflictUi',
  'deviceLimitUi',
  'statusUi',
  'changeWiring',
  'pairingUi',
  'password',
  'storage',
  'relayConfig',
] as const

const methodExampleKeys = [
  'ensureNamespace',
  'sync',
  'notifyLocalChange',
  'flushPush',
  'startPairing',
  'joinPairing',
  'recover',
  'listDevices',
  'revokeDevice',
  'redeemUnlockCode',
  'resolveConflict',
  'getStatus',
] as const

const METHOD_LABELS: Record<(typeof methodExampleKeys)[number], string> = {
  ensureNamespace: 'ensureNamespace()',
  sync: 'sync(documentId?)',
  notifyLocalChange: 'notifyLocalChange(documentId?)',
  flushPush: 'flushPush(documentId?)',
  startPairing: 'startPairing()',
  joinPairing: 'joinPairing(code)',
  recover: 'recover(phrase)',
  listDevices: 'listDevices()',
  revokeDevice: 'revokeDevice(id)',
  redeemUnlockCode: 'redeemUnlockCode(code)',
  resolveConflict: 'resolveConflict(choice, documentId?)',
  getStatus: 'getStatus()',
}

function methodExampleId(key: (typeof methodExampleKeys)[number]) {
  return `method-${key}`
}

export default async function SdkPage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('sdk')
  const tGuides = await getTranslations('guides')
  const relayUrl = getRelayApiBaseUrl()
  const snippets = createGuideSnippets(relayUrl)
  const specHref =
    locale === 'tr'
      ? 'https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/tr/16-APP-REGISTRY.md'
      : 'https://github.com/kemalersin/senkronla/blob/main/docs/envelope-sync-relay/en/16-APP-REGISTRY.md'
  const rich = withDocRich({ relayUrl })
  const sdkRich = withDocRich({
    relayUrl,
    appRegistryLink: (chunks) => <a href="#app-registry">{chunks}</a>,
  })
  const encryptionRich = withDocRich({
    relayUrl,
    apiLink: (chunks) => <Link href="/api#encryption">{chunks}</Link>,
    encryptionLink: (chunks) => <a href="#encryption">{chunks}</a>,
  })
  const appRegistryRich = withDocRich({
    relayUrl,
    apiAppLink: (chunks) => <Link href="/api#app-registry">{chunks}</Link>,
    specLink: (chunks) => (
      <a href={specHref} target="_blank" rel="noopener noreferrer">
        {chunks}
      </a>
    ),
    developerLink: (chunks) => <Link href="/developer">{chunks}</Link>,
    operatorLink: (chunks) => <Link href="/operator">{chunks}</Link>,
  })

  const nav = sectionKeys.map((key) => ({
    id: key,
    label: t(`nav.${key}`),
  }))

  const appLayerRows = [
    [t.rich('sections.appRegistry.layers.app', withDocRich()), t.rich('sections.appRegistry.layers.appDesc', withDocRich())],
    [
      t('sections.appRegistry.layers.device'),
      t.rich('sections.appRegistry.layers.deviceDesc', withDocRich()),
    ],
  ]

  const appConfigRows = [
    [
      t.rich('sections.appRegistry.config.disabled', withDocRich()),
      t('sections.appRegistry.config.disabledDesc'),
    ],
    [
      t.rich('sections.appRegistry.config.operatorManaged', withDocRich()),
      t.rich('sections.appRegistry.config.operatorManagedDesc', appRegistryRich),
    ],
    [
      t.rich('sections.appRegistry.config.selfService', withDocRich()),
      t.rich('sections.appRegistry.config.selfServiceDesc', appRegistryRich),
    ],
  ]

  const optionRows = [
    ['relayUrl', t.rich('sections.connect.options.relayUrl', withDocRich())],
    ['appId', t.rich('sections.connect.options.appId', withDocRich())],
    ['appPlatform', t.rich('sections.connect.options.appPlatform', withDocRich())],
    ['bundleId', t.rich('sections.connect.options.bundleId', withDocRich())],
    ['clientSecret', t.rich('sections.connect.options.clientSecret', withDocRich())],
    ['clientVersion', t.rich('sections.connect.options.clientVersion', withDocRich())],
    ['document', t.rich('sections.connect.options.document', withDocRich())],
    ['documents', t.rich('sections.connect.options.documents', withDocRich())],
    ['storage', t.rich('sections.connect.options.storage', withDocRich())],
    ['onRecoveryPhrase', t.rich('sections.connect.options.onRecoveryPhrase', withDocRich())],
    ['onConflict', t.rich('sections.connect.options.onConflict', withDocRich())],
    ['onDeviceLimit', t.rich('sections.connect.options.onDeviceLimit', withDocRich())],
    ['onDocumentStatusChange', t.rich('sections.connect.options.onDocumentStatusChange', withDocRich())],
    ['pushDebounceMs', t.rich('sections.connect.options.pushDebounceMs', withDocRich())],
    ['notificationsEnabled', t.rich('sections.connect.options.notificationsEnabled', withDocRich())],
    ['persistRecoveryPhrase', t.rich('sections.connect.options.persistRecoveryPhrase', withDocRich())],
  ]

  const methodRows = methodExampleKeys.map((key) => [
    <a key={key} href={`#${methodExampleId(key)}`} className="doc-method-link">
      <DocTag>{METHOD_LABELS[key]}</DocTag>
    </a>,
    t.rich(`sections.methods.rows.${key}`, withDocRich()),
  ])

  const statusRows = [
    ['idle', t.rich('sections.status.rows.idle', withDocRich())],
    ['syncing', t.rich('sections.status.rows.syncing', withDocRich())],
    ['pending_push', t.rich('sections.status.rows.pendingPush', withDocRich())],
    ['conflict', t.rich('sections.status.rows.conflict', withDocRich())],
    ['offline', t.rich('sections.status.rows.offline', withDocRich())],
    ['ws_connected', t.rich('sections.status.rows.wsConnected', withDocRich())],
  ]

  const clientErrorRows = [
    ['ESR_CLIENT_NO_TOKEN', t.rich('sections.errors.client.noToken', withDocRich())],
    ['ESR_CLIENT_OFFLINE', t.rich('sections.errors.client.offline', withDocRich())],
    ['ESR_CLIENT_NAMESPACE_EXISTS', t.rich('sections.errors.client.namespaceExists', withDocRich())],
    ['ESR_CLIENT_CONFLICT_CANCELLED', t.rich('sections.errors.client.conflictCancelled', withDocRich())],
    ['REVISION_CONFLICT', t.rich('sections.errors.client.revisionConflict', withDocRich())],
    ['DEVICE_LIMIT_*', t.rich('sections.errors.client.deviceLimit', withDocRich())],
  ]

  const integrationRows = integrationRowKeys.map((key) => [
    t(`sections.integration.rowLabels.${key}`),
    t.rich(`sections.integration.rowApp.${key}`, withDocRich()),
    t.rich(`sections.integration.rowSdk.${key}`, withDocRich()),
  ])

  return (
    <DocsLayout title={t('title')} intro={t.rich('intro', withDocRich())} nav={nav}>
      <DocCallout variant="info" title={tGuides('agentsCalloutTitle')}>
        <p>{tGuides('agentsCalloutBody')}</p>
        <p>
          <Link href="/guides/agents">{tGuides('agentsCalloutLink')}</Link>
        </p>
      </DocCallout>

      <DocSection id="integration" title={t('sections.integration.title')}>
        <p>{t.rich('sections.integration.p1', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.integration.legendTitle')}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.integration.legendApp', withDocRich())}</li>
          <li>{t.rich('sections.integration.legendSdk', withDocRich())}</li>
        </ul>
        <CodeBlock code={SDK_SAMPLE_LEGEND} language="typescript" />
        <p className="doc-subheading">{t('sections.integration.tableTitle')}</p>
        <DocsTable
          headers={[t('table.field'), t('table.appProvide'), t('table.sdkProvides')]}
          rows={integrationRows}
        />
      </DocSection>

      <DocSection id="quick-start" title={t('sections.quickStart.title')}>
        <p>{t.rich('sections.quickStart.p1', withDocRich())}</p>
        <DocCallout variant="info" title={t('sections.quickStart.appRegistryTitle')}>
          <p>{t.rich('sections.quickStart.appRegistryBody', sdkRich)}</p>
        </DocCallout>
        <DocCallout variant="tip" title={t('sections.quickStart.tipTitle')}>
          <p>{t.rich('sections.quickStart.tipBody', rich)}</p>
        </DocCallout>
        <CodeBlock code={snippets.minimalSetup} language="typescript" />
      </DocSection>

      <DocSection id="install" title={t('sections.install.title')}>
        <p>{t('sections.install.p1')}</p>
        <CodeBlock code="pnpm add @senkronla/client" language="bash" />
        <p>{t.rich('sections.install.p2', withDocRich())}</p>
      </DocSection>

      <DocSection id="connect" title={t('sections.connect.title')}>
        <p>{t.rich('sections.connect.p1', withDocRich())}</p>
        <DocsTable headers={[t('table.option'), t('table.description')]} rows={optionRows} />
        <p>{t.rich('sections.connect.p2', sdkRich)}</p>
        <p className="doc-subheading">{t('sections.connect.exampleTitle')}</p>
        <CodeBlock code={snippets.connectOptions} language="typescript" />
      </DocSection>

      <DocSection id="app-registry" title={t('sections.appRegistry.title')}>
        <p>{t.rich('sections.appRegistry.p1', appRegistryRich)}</p>
        <p className="doc-subheading">{t('sections.appRegistry.layersTitle')}</p>
        <DocsTable
          headers={[t('table.layer'), t('table.description')]}
          rows={appLayerRows}
        />
        <p className="doc-subheading">{t('sections.appRegistry.configTitle')}</p>
        <DocsTable
          headers={[t('table.relayConfig'), t('table.action')]}
          rows={appConfigRows}
        />
        <p>{t.rich('sections.appRegistry.p2', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.appRegistry.webExampleTitle')}</p>
        <CodeBlock code={snippets.connectWithAppWeb} language="typescript" />
        <p className="doc-subheading">{t('sections.appRegistry.nativeExampleTitle')}</p>
        <CodeBlock code={snippets.connectWithAppNative} language="typescript" />
        <p className="doc-subheading">{t('sections.appRegistry.registrationTitle')}</p>
        <p>{t.rich('sections.appRegistry.registrationP1', appRegistryRich)}</p>
        <p className="doc-subheading">{t('sections.appRegistry.approvalTitle')}</p>
        <p>{t.rich('sections.appRegistry.approvalWebP1', withDocRich())}</p>
        <p>{t.rich('sections.appRegistry.approvalNativeP1', appRegistryRich)}</p>
        <p className="doc-subheading">{t('sections.appRegistry.secretTitle')}</p>
        <p>{t.rich('sections.appRegistry.secretP1', withDocRich())}</p>
        <p>{t.rich('sections.appRegistry.secretP2', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.appRegistry.pairingTitle')}</p>
        <p>{t.rich('sections.appRegistry.pairingP1', withDocRich())}</p>
        <DocCallout variant="tip" title={t('sections.appRegistry.tipTitle')}>
          <p>{t.rich('sections.appRegistry.tipBody', withDocRich())}</p>
        </DocCallout>
        <DocCallout variant="info" title={t('sections.appRegistry.migrationTitle')}>
          <p>{t.rich('sections.appRegistry.migrationP1', appRegistryRich)}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="multi-document" title={t('sections.multiDocument.title')}>
        <p>{t.rich('sections.multiDocument.p1', withDocRich())}</p>
        <p>{t.rich('sections.multiDocument.p2', withDocRich())}</p>
        <CodeBlock code={snippets.multiDocumentSync} language="typescript" />
        <DocCallout variant="tip" title={t('sections.multiDocument.tipTitle')}>
          <p>{t.rich('sections.multiDocument.tipBody', withDocRich())}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="adapter" title={t('sections.adapter.title')}>
        <p>{t.rich('sections.adapter.p1', withDocRich())}</p>
        <DocsTable
          headers={[t('table.field'), t('table.description')]}
          rows={[
            ['namespaceId()', t('sections.adapter.fields.namespaceId')],
            ['namespaceLabel()', t('sections.adapter.fields.namespaceLabel')],
            ['buildDocument()', t('sections.adapter.fields.buildDocument')],
            ['importDocument()', t('sections.adapter.fields.importDocument')],
            ['contentType()', t('sections.adapter.fields.contentType')],
          ]}
        />
        <p>{t.rich('sections.adapter.p2', encryptionRich)}</p>
        <CodeBlock
          code={`const document = createDocumentAdapter({
  namespaceId: appWorkspace.id,
  namespaceLabel: appWorkspace.name,
  contentType: 'application/vnd.yourapp+json',
  // app: serialize / restore app state as JSON
  exportDocument: () => appStore.exportSnapshot(),
  importDocument: (json) => appStore.importSnapshot(json),
})`}
          language="typescript"
        />
      </DocSection>

      <DocSection id="encryption" title={t('sections.encryption.title')}>
        <p>{t.rich('sections.encryption.p1', encryptionRich)}</p>
        <p className="doc-subheading">{t('sections.encryption.passwordTitle')}</p>
        <p>{t.rich('sections.encryption.passwordP1', withDocRich())}</p>
        <p>{t('sections.encryption.passwordP2')}</p>
        <p className="doc-subheading">{t('sections.encryption.flowTitle')}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.encryption.flowLi1', withDocRich())}</li>
          <li>{t.rich('sections.encryption.flowLi2', withDocRich())}</li>
          <li>{t.rich('sections.encryption.flowLi3', withDocRich())}</li>
        </ul>
        <p className="doc-subheading">{t('sections.encryption.exampleTitle')}</p>
        <CodeBlock code={snippets.encryptedDocumentAdapter} language="typescript" />
        <p className="doc-subheading">{t('sections.encryption.envelopeExampleTitle')}</p>
        <CodeBlock code={snippets.buildEncryptedEnvelope} language="typescript" />
        <DocCallout variant="warn" title={t('sections.encryption.warnTitle')}>
          <p>{t.rich('sections.encryption.warnBody', withDocRich())}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="storage" title={t('sections.storage.title')}>
        <p>{t.rich('sections.storage.p1', withDocRich())}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.storage.li1', withDocRich())}</li>
          <li>{t.rich('sections.storage.li2', withDocRich())}</li>
          <li>{t.rich('sections.storage.li3', withDocRich())}</li>
          <li>{t.rich('sections.storage.li4', withDocRich())}</li>
        </ul>
        <DocCallout variant="info" title={t('sections.storage.calloutTitle')}>
          <p>{t.rich('sections.storage.calloutBody', withDocRich())}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="methods" title={t('sections.methods.title')}>
        <p>{t('sections.methods.p1')}</p>
        <DocsTable headers={[t('table.method'), t('table.description')]} rows={methodRows} tagFirstColumn={false} />
        <p className="doc-subheading">{t('sections.methods.examplesTitle')}</p>
        {methodExampleKeys.map((key) => (
          <div key={key}>
            <h3 id={methodExampleId(key)} className="doc-subheading doc-method-name">
              <DocTag>{METHOD_LABELS[key]}</DocTag>
            </h3>
            <p className="doc-muted">{t(`sections.methods.examples.${key}.desc`)}</p>
            <CodeBlock code={snippets[key]} language="typescript" />
          </div>
        ))}
      </DocSection>

      <DocSection id="sync" title={t('sections.sync.title')}>
        <p>{t('sections.sync.p1')}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.sync.li1', withDocRich())}</li>
          <li>{t.rich('sections.sync.li2', withDocRich())}</li>
          <li>{t.rich('sections.sync.li3', withDocRich())}</li>
          <li>{t.rich('sections.sync.li4', withDocRich())}</li>
        </ul>
        <CodeBlock
          code={`await sync.ensureNamespace()
await sync.sync() // all documents

// app: call after every local edit (Redux, DB hook, etc.)
appStore.onChange(() => sync.notifyLocalChange('primary'))
appSettingsStore.onChange(() => sync.notifyLocalChange('settings'))
await sync.sync('settings') // optional: one document only
window.addEventListener('focus', () => void sync.sync())
await sync.flushPush() // all pending; or flushPush('primary')`}
          language="typescript"
        />
      </DocSection>

      <DocSection id="pairing" title={t('sections.pairing.title')}>
        <p>{t.rich('sections.pairing.p1', withDocRich())}</p>
        <p>{t.rich('sections.pairing.p2', withDocRich())}</p>
        <p className="doc-subheading">{t('sections.pairing.hostExample')}</p>
        <CodeBlock code={snippets.pairingHost} language="typescript" />
        <p className="doc-subheading">{t('sections.pairing.guestExample')}</p>
        <CodeBlock code={snippets.pairingGuest} language="typescript" />
      </DocSection>

      <DocSection id="conflicts" title={t('sections.conflicts.title')}>
        <p>{t.rich('sections.conflicts.p1', withDocRich())}</p>
        <p>{t.rich('sections.conflicts.p2', withDocRich())}</p>
        <CodeBlock
          code={`// app: implement — not provided by @senkronla/client
onConflict: async (ctx) => {
  return appUi.askKeepLocalOrRemote({
    documentId: ctx.documentId,
    remoteWrittenAt: ctx.remoteMeta.writtenAt,
  })
  // return 'remote' | 'local' | 'cancel'
}`}
          language="typescript"
        />
        <p className="doc-subheading">{t('sections.conflicts.manualExample')}</p>
        <CodeBlock code={snippets.resolveConflict} language="typescript" />
      </DocSection>

      <DocSection id="notifications" title={t('sections.notifications.title')}>
        <p>{t.rich('sections.notifications.p1', withDocRich())}</p>
        <p>{t.rich('sections.notifications.p2', withDocRich())}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.notifications.li1', withDocRich())}</li>
          <li>{t.rich('sections.notifications.li2', withDocRich())}</li>
          <li>{t.rich('sections.notifications.li3', withDocRich())}</li>
        </ul>
      </DocSection>

      <DocSection id="status" title={t('sections.status.title')}>
        <p>{t.rich('sections.status.p1', withDocRich())}</p>
        <DocsTable headers={[t('table.status'), t('table.meaning')]} rows={statusRows} />
        <p className="doc-subheading">{t('sections.status.exampleTitle')}</p>
        <CodeBlock code={snippets.getStatus} language="typescript" />
      </DocSection>

      <DocSection id="errors" title={t('sections.errors.title')}>
        <p>{t.rich('sections.errors.p1', withDocRich())}</p>
        <DocsTable headers={[t('table.code'), t('table.action')]} rows={clientErrorRows} />
        <p>{t.rich('sections.errors.p2', withDocRich())}</p>
      </DocSection>
    </DocsLayout>
  )
}
