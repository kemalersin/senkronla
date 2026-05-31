'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

import { OperatorMailSettingsPanel } from '@/components/operator-mail-settings-panel'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'

export function OperatorSettingsDrawer({
  open,
  authState,
  onClose,
  onUnauthorized,
}: {
  open: boolean
  authState: 'loading' | 'guest' | 'authenticated'
  onClose: () => void
  onUnauthorized: () => void
}) {
  const t = useTranslations('operator')

  usePageScrollLock(open, 'operator-settings-drawer')

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

        <div className="operator-apps-drawer-body">
          <OperatorMailSettingsPanel
            variant="drawer"
            authState={authState}
            onUnauthorized={onUnauthorized}
          />
        </div>
      </aside>
    </>
  )
}
