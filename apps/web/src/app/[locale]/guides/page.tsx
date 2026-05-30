import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CodeBlock } from '@/components/code-block'
import { DocCallout } from '@/components/doc-callout'
import { DocSection } from '@/components/doc-section'
import { DocStepList } from '@/components/doc-step-list'
import { DocsLayout } from '@/components/docs-layout'
import { DocsTable } from '@/components/docs-table'
import { Link } from '@/i18n/navigation'
import { createGuideSnippets } from '@/lib/doc-snippets'
import { withDocRich } from '@/lib/doc-rich-text'
import { getRelayApiBaseUrl } from '@/lib/public-api-url'

interface PageProps {
  params: Promise<{ locale: string }>
}

const sectionKeys = [
  'concepts',
  'checklist',
  'multi-document',
  'first-device',
  'second-device',
  'recovery',
  'offline',
  'limits',
  'choose',
] as const

export default async function GuidesPage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('guides')
  const relayUrl = getRelayApiBaseUrl()
  const snippets = createGuideSnippets(relayUrl)
  const rich = withDocRich({
    relayUrl,
    sdkAppLink: (chunks) => <Link href="/sdk#app-registry">{chunks}</Link>,
  })

  const nav = sectionKeys.map((key) => ({
    id: key,
    label: t(`nav.${key}`),
  }))

  const conceptRows = [
    ['namespace', t.rich('sections.concepts.rows.namespace', withDocRich())],
    ['device token', t.rich('sections.concepts.rows.deviceToken', withDocRich())],
    ['clientDeviceId', t.rich('sections.concepts.rows.clientDeviceId', withDocRich())],
    ['recovery phrase', t.rich('sections.concepts.rows.recoveryPhrase', withDocRich())],
    ['revision', t.rich('sections.concepts.rows.revision', withDocRich())],
    ['envelope', t.rich('sections.concepts.rows.envelope', withDocRich())],
    ['document', t.rich('sections.concepts.rows.document', withDocRich())],
    ['primary', t.rich('sections.concepts.rows.primaryDocument', withDocRich())],
    ['pairing code', t.rich('sections.concepts.rows.pairingCode', withDocRich())],
  ]

  const checklistSteps = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    title: t(`sections.checklist.steps.s${n}.title`),
    body: t.rich(`sections.checklist.steps.s${n}.body`, rich),
  }))

  const firstDeviceSteps = [1, 2, 3, 4, 5].map((n) => ({
    title: t(`sections.firstDevice.steps.s${n}.title`),
    body: t.rich(`sections.firstDevice.steps.s${n}.body`, withDocRich()),
  }))

  const secondDeviceSteps = [1, 2, 3].map((n) => ({
    title: t(`sections.secondDevice.steps.s${n}.title`),
    body: t.rich(`sections.secondDevice.steps.s${n}.body`, withDocRich()),
  }))

  const recoverySteps = [1, 2, 3].map((n) => ({
    title: t(`sections.recovery.steps.s${n}.title`),
    body: t.rich(`sections.recovery.steps.s${n}.body`, withDocRich()),
  }))

  return (
    <DocsLayout title={t('title')} intro={t('intro')} nav={nav}>
      <div className="doc-callout-stack">
        <DocCallout variant="info" title={t('esrCalloutTitle')}>
          <p>{t('esrCalloutBody')}</p>
          <p>
            <Link href="/guides/esr">{t('esrCalloutLink')}</Link>
          </p>
        </DocCallout>

        <DocCallout variant="info" title={t('agentsCalloutTitle')}>
          <p>{t('agentsCalloutBody')}</p>
          <p>
            <Link href="/guides/agents">{t('agentsCalloutLink')}</Link>
          </p>
        </DocCallout>
      </div>

      <DocSection id="concepts" title={t('sections.concepts.title')}>
        <p>{t('sections.concepts.p1')}</p>
        <DocsTable headers={[t('table.term'), t('table.meaning')]} rows={conceptRows} />
        <DocCallout variant="info" title={t('sections.concepts.calloutTitle')}>
          <p>{t('sections.concepts.calloutBody')}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="checklist" title={t('sections.checklist.title')}>
        <p>{t('sections.checklist.p1')}</p>
        <DocStepList steps={checklistSteps} />
        <p>
          <Link href="/guides/esr">{t('esrCalloutLink')}</Link>
        </p>
      </DocSection>

      <DocSection id="multi-document" title={t('sections.multiDocument.title')}>
        <p>{t.rich('sections.multiDocument.p1', withDocRich())}</p>
        <p>{t.rich('sections.multiDocument.p2', withDocRich())}</p>
        <CodeBlock code={snippets.multiDocumentSync} language="typescript" />
        <p>
          <Link href="/sdk#multi-document">{t('sections.multiDocument.sdkLink')}</Link>
        </p>
      </DocSection>

      <DocSection id="first-device" title={t('sections.firstDevice.title')}>
        <p>{t('sections.firstDevice.p1')}</p>
        <DocStepList steps={firstDeviceSteps} />
        <p className="doc-subheading">{t('sections.firstDevice.codeTitle')}</p>
        <CodeBlock code={snippets.minimalSetup} language="typescript" />
        <p>{t.rich('sections.firstDevice.p2', withDocRich())}</p>
      </DocSection>

      <DocSection id="second-device" title={t('sections.secondDevice.title')}>
        <p>{t.rich('sections.secondDevice.p1', withDocRich())}</p>
        <DocStepList steps={secondDeviceSteps} />
        <p className="doc-subheading">{t('sections.secondDevice.hostTitle')}</p>
        <CodeBlock code={snippets.pairingHost} language="typescript" />
        <p className="doc-subheading">{t('sections.secondDevice.guestTitle')}</p>
        <CodeBlock code={snippets.pairingGuest} language="typescript" />
      </DocSection>

      <DocSection id="recovery" title={t('sections.recovery.title')}>
        <p>{t.rich('sections.recovery.p1', withDocRich())}</p>
        <DocCallout variant="warn" title={t('sections.recovery.warnTitle')}>
          <p>{t('sections.recovery.warnBody')}</p>
        </DocCallout>
        <DocStepList steps={recoverySteps} />
        <CodeBlock code={snippets.recovery} language="typescript" />
      </DocSection>

      <DocSection id="offline" title={t('sections.offline.title')}>
        <p>{t.rich('sections.offline.p1', withDocRich())}</p>
        <DocStepList
          steps={[1, 2, 3].map((n) => ({
            title: t(`sections.offline.steps.s${n}.title`),
            body: t.rich(`sections.offline.steps.s${n}.body`, withDocRich()),
          }))}
        />
        <DocCallout variant="tip" title={t('sections.offline.tipTitle')}>
          <p>{t.rich('sections.offline.tipBody', withDocRich())}</p>
        </DocCallout>
      </DocSection>

      <DocSection id="limits" title={t('sections.limits.title')}>
        <p>{t.rich('sections.limits.p1', withDocRich())}</p>
        <ul className="doc-list">
          <li>{t.rich('sections.limits.li1', withDocRich())}</li>
          <li>{t.rich('sections.limits.li2', withDocRich())}</li>
          <li>{t.rich('sections.limits.li3', withDocRich())}</li>
        </ul>
      </DocSection>

      <DocSection id="choose" title={t('sections.choose.title')}>
        <p>{t('sections.choose.p1')}</p>
        <div className="compare-grid">
          <article className="landing-card">
            <h3>{t('sections.choose.sdkTitle')}</h3>
            <p>{t('sections.choose.sdkBody')}</p>
          </article>
          <article className="landing-card">
            <h3>{t('sections.choose.apiTitle')}</h3>
            <p>{t('sections.choose.apiBody')}</p>
          </article>
        </div>
        <p>
          {t('sections.choose.next')}{' '}
          <Link href="/sdk">{t('sections.choose.sdkLink')}</Link>
          {' · '}
          <Link href="/api">{t('sections.choose.apiLink')}</Link>
        </p>
      </DocSection>
    </DocsLayout>
  )
}
