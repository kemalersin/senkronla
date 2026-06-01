'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  OperatorRevisionsPanel,
  type OperatorRevisionsScope,
} from '@/components/operator-revisions-panel'
import { OperatorSpinner } from '@/components/operator-spinner'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'
import { useTranslations } from 'next-intl'

export type OperatorRevisionPurgeTarget =
  | {
      scope: 'namespace'
      scopeId: string
      title: string
      subtitle?: string
    }
  | {
      scope: 'app'
      scopeId: string
      title: string
      subtitle?: string
    }

interface OperatorRevisionPurgeModalProps {
  target: OperatorRevisionPurgeTarget | null
  apiBase?: string
  onClose: () => void
  onUnauthorized: () => void
  onPurged?: () => void
}

export function OperatorRevisionPurgeModal({
  target,
  apiBase = '/api/operator',
  onClose,
  onUnauthorized,
  onPurged,
}: OperatorRevisionPurgeModalProps) {
  const t = useTranslations('operator.revisions')
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    setSettingsLoaded(false)
  }, [target])

  usePageScrollLock(Boolean(target), 'operator-revision-purge-modal')

  if (!target || typeof document === 'undefined') {
    return null
  }

  const scope: OperatorRevisionsScope = target.scope

  return createPortal(
    <div className="operator-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className={`operator-modal operator-modal--revisions${settingsLoaded ? '' : ' is-loading'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="operator-revision-purge-title"
        onClick={(event) => event.stopPropagation()}
      >
        {!settingsLoaded ? (
          <div className="operator-revisions-modal-loading" aria-live="polite" aria-busy="true">
            <OperatorSpinner label={t('loadingSettings')} />
          </div>
        ) : null}

        <header className="operator-modal-header">
          <div>
            <h3 id="operator-revision-purge-title">{t('title')}</h3>
          </div>
          <button
            type="button"
            className="operator-modal-close"
            aria-label={t('closeModal')}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="operator-modal-body operator-modal-body--revisions">
          <OperatorRevisionsPanel
            variant="modal"
            scope={scope}
            scopeId={target.scopeId}
            title={target.title}
            subtitle={target.subtitle}
            apiBase={apiBase}
            onUnauthorized={onUnauthorized}
            onPurged={onPurged}
            onCancel={onClose}
            onSettingsLoadedChange={setSettingsLoaded}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
