'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { OperatorScopedDangerPanel } from '@/components/operator-scoped-danger-panel'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'

interface NamespaceDrawerRow {
  namespaceId: string
  namespaceLabel: string
  freeDeviceLimit: number
  purchasedSlots: number
  activeDevices: number
  createdAt: string
  documentCount: number
  appId: string | null
  appName: string | null
}

interface OperatorNamespaceDrawerProps {
  row: NamespaceDrawerRow | null
  appsEnabled: boolean
  locale: string
  onClose: () => void
  onDeleted: () => void
  onUnauthorized: () => void
}

type DrawerTab = 'overview' | 'danger'

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderAppCell(row: { appId: string | null; appName: string | null }) {
  if (!row.appId) {
    return '—'
  }

  return (
    <>
      <span>{row.appName ?? row.appId}</span>
      {row.appName && (
        <code className="operator-namespace-app-id">{row.appId}</code>
      )}
    </>
  )
}

export function OperatorNamespaceDrawer({
  row,
  appsEnabled,
  locale,
  onClose,
  onDeleted,
  onUnauthorized,
}: OperatorNamespaceDrawerProps) {
  const t = useTranslations('operator')
  const [tab, setTab] = useState<DrawerTab>('overview')

  usePageScrollLock(Boolean(row), 'operator-namespace-drawer')

  useEffect(() => {
    if (!row) {
      setTab('overview')
    }
  }, [row])

  useEffect(() => {
    if (!row) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, row])

  if (!row) {
    return null
  }

  return (
    <>
      <button
        type="button"
        className="operator-apps-drawer-backdrop"
        aria-label={t('namespaces.closeDetail')}
        onClick={onClose}
      />
      <aside
        className="operator-apps-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operator-namespace-drawer-title"
      >
        <header className="operator-apps-drawer-header">
          <div className="operator-apps-drawer-heading">
            <p className="operator-apps-drawer-id">
              <code>{row.namespaceId}</code>
            </p>
            <h3 id="operator-namespace-drawer-title">{row.namespaceLabel}</h3>
          </div>
          <button
            type="button"
            className="operator-apps-drawer-close"
            aria-label={t('namespaces.closeDetail')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <nav className="operator-settings-tabs" aria-label={t('settingsTabs.danger')}>
          <button
            type="button"
            role="tab"
            className="operator-tab"
            data-active={tab === 'overview' ? 'true' : 'false'}
            aria-selected={tab === 'overview'}
            onClick={() => setTab('overview')}
          >
            {t('drawerTabs.overview')}
          </button>
          <button
            type="button"
            role="tab"
            className="operator-tab"
            data-active={tab === 'danger' ? 'true' : 'false'}
            aria-selected={tab === 'danger'}
            onClick={() => setTab('danger')}
          >
            {t('settingsTabs.danger')}
          </button>
        </nav>

        <div className="operator-apps-drawer-body">
          {tab === 'danger' ? (
            <OperatorScopedDangerPanel
              scope="namespace"
              scopeId={row.namespaceId}
              onDeleted={onDeleted}
              onUnauthorized={onUnauthorized}
            />
          ) : (
            <dl className="operator-apps-meta">
              <div className="operator-apps-meta-row-full">
                <dt>{t('columns.namespace')}</dt>
                <dd><code>{row.namespaceId}</code></dd>
              </div>
              <div>
                <dt>{t('columns.label')}</dt>
                <dd>{row.namespaceLabel}</dd>
              </div>
              {appsEnabled && (
                <div>
                  <dt>{t('columns.app')}</dt>
                  <dd className="operator-namespace-app-cell">{renderAppCell(row)}</dd>
                </div>
              )}
              <div>
                <dt>{t('columns.devices')}</dt>
                <dd>{row.activeDevices}</dd>
              </div>
              <div>
                <dt>{t('columns.slots')}</dt>
                <dd>{row.freeDeviceLimit + row.purchasedSlots}</dd>
              </div>
              <div>
                <dt>{t('columns.documentCount')}</dt>
                <dd>{row.documentCount}</dd>
              </div>
              <div>
                <dt>{t('columns.created')}</dt>
                <dd>{formatDate(row.createdAt, locale)}</dd>
              </div>
            </dl>
          )}
        </div>
      </aside>
    </>
  )
}
