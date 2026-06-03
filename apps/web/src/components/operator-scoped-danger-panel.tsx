'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import { fetchJson } from '@/lib/deduped-fetch'

export type ScopedDangerKind = 'namespace' | 'app' | 'developer'

interface ScopedDeleteResponse {
  deleted: {
    namespaces: number
    unlockCodes: number
    unlockEvents: number
    apps: number
    developers: number
    blobNamespaceDirs: number
  }
}

interface ApiErrorBody {
  error?: { message?: string }
}

const CONFIRM_PHRASE: Record<ScopedDangerKind, string> = {
  namespace: 'delete-namespace',
  app: 'delete-app',
  developer: 'delete-developer',
}

const API_PATH: Record<ScopedDangerKind, string> = {
  namespace: '/api/operator/danger/purge-namespace',
  app: '/api/operator/danger/purge-app',
  developer: '/api/operator/danger/purge-developer',
}

const BODY_KEY: Record<ScopedDangerKind, string> = {
  namespace: 'namespaceId',
  app: 'appId',
  developer: 'developerId',
}

interface OperatorScopedDangerPanelProps {
  scope: ScopedDangerKind
  scopeId: string
  onDeleted?: () => void
  onUnauthorized: () => void
}

export function OperatorScopedDangerPanel({
  scope,
  scopeId,
  onDeleted,
  onUnauthorized,
}: OperatorScopedDangerPanelProps) {
  const t = useTranslations(`operator.scopedDanger.${scope}`)

  const confirmPhrase = CONFIRM_PHRASE[scope]
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScopedDeleteResponse | null>(null)

  const confirmMatches = confirmText.trim() === confirmPhrase

  const handleDelete = useCallback(async () => {
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
      const { response, body: rawBody } = await fetchJson(API_PATH[scope], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirm: confirmPhrase,
          [BODY_KEY[scope]]: scopeId,
        }),
      })
      const body = rawBody as ScopedDeleteResponse & ApiErrorBody

      if (response.status === 401) {
        onUnauthorized()
        return
      }

      if (!response.ok) {
        throw new Error(body.error?.message ?? t('deleteFailed'))
      }

      setResult(body)
      setConfirmText('')
      onDeleted?.()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('deleteFailed'))
    } finally {
      setLoading(false)
    }
  }, [confirmMatches, confirmPhrase, onDeleted, onUnauthorized, scope, scopeId, t])

  const itemKeys =
    scope === 'namespace'
      ? (['devices', 'documents', 'unlock', 'rateLimits', 'blobs'] as const)
      : scope === 'app'
        ? (['namespaces', 'origins', 'bundles', 'rateLimits', 'blobs'] as const)
        : (['apps', 'namespaces', 'authTokens', 'rateLimits', 'blobs'] as const)

  return (
    <section className="operator-danger-panel operator-danger-panel--drawer">
      <p className="operator-muted operator-danger-drawer-intro">{t('hint')}</p>

      <div className="operator-danger-zone">
        <h3>{t('deleteTitle')}</h3>
        <p className="operator-danger-warning">{t('deleteWarning')}</p>

        <ul className="operator-danger-list">
          {itemKeys.map((key) => (
            <li key={key}>{t(`deleteItems.${key}`)}</li>
          ))}
        </ul>

        <div className="form-field">
          <label htmlFor={`operator-scoped-danger-${scope}`}>{t('confirmLabel')}</label>
          <input
            id={`operator-scoped-danger-${scope}`}
            type="text"
            value={confirmText}
            autoComplete="off"
            spellCheck={false}
            placeholder={confirmPhrase}
            onChange={(event) => setConfirmText(event.target.value)}
          />
          <p className="operator-muted operator-danger-confirm-hint">
            {t('confirmHint', { phrase: confirmPhrase })}
          </p>
        </div>

        {error && <p className="operator-danger-error">{error}</p>}

        {result && (
          <p className="operator-danger-success" role="status">
            {t('deleteSuccess', {
              namespaces: result.deleted.namespaces,
              apps: result.deleted.apps,
              developers: result.deleted.developers,
              blobs: result.deleted.blobNamespaceDirs,
            })}
          </p>
        )}

        <div className="operator-danger-actions">
          <button
            type="button"
            className="btn btn-danger"
            disabled={!confirmMatches || loading}
            onClick={() => void handleDelete()}
          >
            {loading ? t('deleting') : t('deleteButton')}
          </button>
        </div>
      </div>
    </section>
  )
}
