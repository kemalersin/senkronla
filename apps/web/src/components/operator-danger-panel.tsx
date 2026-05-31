'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import { OperatorSpinner } from '@/components/operator-spinner'
import { fetchJson } from '@/lib/deduped-fetch'

interface PurgeAllRecordsResponse {
  deleted: {
    namespaces: number
    unlockCodes: number
    unlockEvents: number
    rateLimitEvents: number
    operatorLimitAudit: number
    developerAuthTokens: number
    apps: number
    developers: number
    blobNamespaceDirs: number
  }
}

interface ApiErrorBody {
  error?: { message?: string }
}

const CONFIRM_PHRASE = 'purge-all-records'

export function OperatorDangerPanel({
  authState,
  onUnauthorized,
  onPurged,
  variant = 'drawer',
}: {
  authState: 'loading' | 'guest' | 'authenticated'
  onUnauthorized: () => void
  onPurged?: () => void
  variant?: 'page' | 'drawer'
}) {
  const t = useTranslations('operator.danger')

  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PurgeAllRecordsResponse | null>(null)

  const confirmMatches = confirmText.trim() === CONFIRM_PHRASE

  const handlePurge = useCallback(async () => {
    if (!confirmMatches) {
      return
    }

    if (!window.confirm(t('confirmDialog'))) {
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const { response, body: rawBody } = await fetchJson('/api/operator/danger/purge-all-records', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: CONFIRM_PHRASE }),
      })
      const body = rawBody as PurgeAllRecordsResponse & ApiErrorBody

      if (response.status === 401) {
        onUnauthorized()
        return
      }

      if (!response.ok) {
        throw new Error(body.error?.message ?? t('purgeFailed'))
      }

      setResult(body)
      setConfirmText('')
      onPurged?.()
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : t('purgeFailed'))
    } finally {
      setLoading(false)
    }
  }, [confirmMatches, onPurged, onUnauthorized, t])

  if (authState === 'loading') {
    return <OperatorSpinner label={t('loading')} compact />
  }

  if (authState === 'guest') {
    return null
  }

  return (
    <section className={`operator-danger-panel${variant === 'drawer' ? ' operator-danger-panel--drawer' : ''}`}>
      {variant === 'page' && (
        <header className="operator-danger-header">
          <h2>{t('title')}</h2>
          <p className="operator-muted">{t('hint')}</p>
        </header>
      )}

      {variant === 'drawer' && <p className="operator-muted operator-danger-drawer-intro">{t('hint')}</p>}

      <div className="operator-danger-zone">
        <h3>{t('purgeTitle')}</h3>
        <p className="operator-danger-warning">{t('purgeWarning')}</p>

        <ul className="operator-danger-list">
          <li>{t('purgeItems.namespaces')}</li>
          <li>{t('purgeItems.devices')}</li>
          <li>{t('purgeItems.documents')}</li>
          <li>{t('purgeItems.unlock')}</li>
          <li>{t('purgeItems.rateLimits')}</li>
          <li>{t('purgeItems.apps')}</li>
          <li>{t('purgeItems.developers')}</li>
        </ul>

        <p className="operator-muted operator-danger-kept">{t('purgeKept')}</p>

        <div className="form-field">
          <label htmlFor="operator-purge-confirm">{t('confirmLabel')}</label>
          <input
            id="operator-purge-confirm"
            type="text"
            value={confirmText}
            autoComplete="off"
            spellCheck={false}
            placeholder={CONFIRM_PHRASE}
            onChange={(event) => setConfirmText(event.target.value)}
          />
          <p className="operator-muted operator-danger-confirm-hint">{t('confirmHint', { phrase: CONFIRM_PHRASE })}</p>
        </div>

        {error && <p className="operator-danger-error">{error}</p>}

        {result && (
          <p className="operator-danger-success" role="status">
            {t('purgeSuccess', { namespaces: result.deleted.namespaces })}
          </p>
        )}

        <div className="operator-danger-actions">
          <button
            type="button"
            className="btn btn-danger"
            disabled={!confirmMatches || loading}
            onClick={() => void handlePurge()}
          >
            {loading ? t('purging') : t('purgeButton')}
          </button>
        </div>
      </div>
    </section>
  )
}
