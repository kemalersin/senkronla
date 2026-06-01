'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { OperatorDangerPanel } from '@/components/operator-danger-panel'
import { OperatorMailSettingsPanel } from '@/components/operator-mail-settings-panel'
import { OperatorRevisionsPanel } from '@/components/operator-revisions-panel'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'

type SettingsTab = 'mail' | 'revisions' | 'danger'

export function OperatorSettingsDrawer({
  open,
  authState,
  onClose,
  onUnauthorized,
  onRecordsPurged,
}: {
  open: boolean
  authState: 'loading' | 'guest' | 'authenticated'
  onClose: () => void
  onUnauthorized: () => void
  onRecordsPurged?: () => void
}) {
  const t = useTranslations('operator')
  const [tab, setTab] = useState<SettingsTab>('mail')

  usePageScrollLock(open, 'operator-settings-drawer')

  useEffect(() => {
    if (!open) {
      setTab('mail')
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'mail', label: t('settingsTabs.mail') },
    { id: 'revisions', label: t('settingsTabs.revisions') },
    { id: 'danger', label: t('settingsTabs.danger') },
  ]

  return (
    <>
      <button
        type="button"
        className="operator-apps-drawer-backdrop"
        aria-label={t('closeSettings')}
        onClick={onClose}
      />
      <aside
        className="operator-apps-drawer operator-settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operator-settings-drawer-title"
      >
        <header className="operator-apps-drawer-header">
          <div className="operator-apps-drawer-heading">
            <h3 id="operator-settings-drawer-title">{t('settingsButton')}</h3>
          </div>
          <button
            type="button"
            className="operator-apps-drawer-close"
            aria-label={t('closeSettings')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <nav className="operator-settings-tabs" aria-label={t('settingsButton')}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`operator-settings-tab-${item.id}`}
              className="operator-tab"
              data-active={tab === item.id ? 'true' : 'false'}
              aria-selected={tab === item.id}
              aria-controls={`operator-settings-panel-${item.id}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="operator-apps-drawer-body">
          {tab === 'mail' && (
            <div
              role="tabpanel"
              id="operator-settings-panel-mail"
              aria-labelledby="operator-settings-tab-mail"
            >
              <OperatorMailSettingsPanel
                variant="drawer"
                authState={authState}
                onUnauthorized={onUnauthorized}
              />
            </div>
          )}

          {tab === 'revisions' && (
            <div
              role="tabpanel"
              id="operator-settings-panel-revisions"
              aria-labelledby="operator-settings-tab-revisions"
            >
              <OperatorRevisionsPanel
                variant="drawer"
                scope="deployment"
                onUnauthorized={onUnauthorized}
              />
            </div>
          )}

          {tab === 'danger' && (
            <div
              role="tabpanel"
              id="operator-settings-panel-danger"
              aria-labelledby="operator-settings-tab-danger"
            >
              <OperatorDangerPanel
                variant="drawer"
                authState={authState}
                onUnauthorized={onUnauthorized}
                onPurged={onRecordsPurged}
              />
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
