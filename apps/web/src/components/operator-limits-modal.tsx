'use client'

import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'

import { OperatorLimitsSection } from '@/components/operator-limits-section'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'

type LimitScope = 'namespaces' | 'apps' | 'developers'

export interface OperatorLimitsTarget {
  scope: LimitScope
  scopeId: string
  title: string
  subtitle?: string
}

interface OperatorLimitsModalProps {
  target: OperatorLimitsTarget | null
  apiBase?: string
  onClose: () => void
  onUnauthorized: () => void
}

export function OperatorLimitsModal({
  target,
  apiBase = '/api/operator',
  onClose,
  onUnauthorized,
}: OperatorLimitsModalProps) {
  const t = useTranslations('operator.limits')

  usePageScrollLock(Boolean(target), 'operator-limits-modal')

  if (!target || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="operator-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="operator-modal operator-modal--limits"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operator-limits-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="operator-modal-header">
          <div>
            <h3 id="operator-limits-modal-title">{target.title}</h3>
            {target.subtitle ? <p className="operator-muted">{target.subtitle}</p> : null}
            <p className="operator-muted">{t('hint')}</p>
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

        <div className="operator-modal-body">
          <OperatorLimitsSection
            scope={target.scope}
            scopeId={target.scopeId}
            apiBase={apiBase}
            showHeader={false}
            onUnauthorized={onUnauthorized}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
