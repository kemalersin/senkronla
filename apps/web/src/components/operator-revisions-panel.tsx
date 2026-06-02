'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { OperatorSegmentedField } from '@/components/operator-segmented-field'
import { OperatorSpinner } from '@/components/operator-spinner'
import { fetchJson } from '@/lib/deduped-fetch'

export type RevisionPurgeMode = 'date' | 'count'

export type OperatorRevisionsScope = 'deployment' | 'namespace' | 'app'

export interface OperatorRevisionsPanelProps {
  scope: OperatorRevisionsScope
  scopeId?: string
  title?: string
  subtitle?: string
  apiBase?: string
  variant?: 'modal' | 'drawer'
  onUnauthorized: () => void
  onPurged?: () => void
  onCancel?: () => void
  onSettingsLoadedChange?: (loaded: boolean) => void
}

interface SyncSettingsResponse {
  revisionRetentionDays: number
  revisionRetentionCount: number
}

interface PurgeRevisionsResponse {
  deletedRevisions: number
  deletedBlobFiles: number
}

interface ApiErrorBody {
  error?: { message?: string }
}

function defaultBeforeDate(): string {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return date.toISOString().slice(0, 10)
}

export function OperatorRevisionsPanel({
  scope,
  scopeId,
  title,
  subtitle,
  apiBase = '/api/operator',
  variant = 'modal',
  onUnauthorized,
  onPurged,
  onCancel,
  onSettingsLoadedChange,
}: OperatorRevisionsPanelProps) {
  const t = useTranslations('operator.revisions')

  const [mode, setMode] = useState<RevisionPurgeMode>('date')
  const [beforeDate, setBeforeDate] = useState(defaultBeforeDate)
  const [keepLastRevisions, setKeepLastRevisions] = useState('50')
  const [retentionDays, setRetentionDays] = useState<number | null>(null)
  const [retentionCount, setRetentionCount] = useState<number | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PurgeRevisionsResponse | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      setSettingsLoaded(false)
      try {
        const { response, body } = await fetchJson(`${apiBase}/settings/sync`)
        if (cancelled) {
          return
        }

        if (response.status === 401) {
          onUnauthorized()
          return
        }

        if (response.ok) {
          const settings = body as SyncSettingsResponse
          setRetentionDays(settings.revisionRetentionDays)
          setRetentionCount(settings.revisionRetentionCount)
        }
      } finally {
        if (!cancelled) {
          setSettingsLoaded(true)
        }
      }
    }

    void loadSettings()

    return () => {
      cancelled = true
    }
  }, [apiBase, onUnauthorized])

  useEffect(() => {
    if (variant !== 'modal') {
      return
    }

    onSettingsLoadedChange?.(settingsLoaded)
  }, [onSettingsLoadedChange, settingsLoaded, variant])

  const handlePurge = useCallback(async () => {
    if (!window.confirm(t('confirmDialog'))) {
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      if (mode === 'count') {
        const parsedCount = Number.parseInt(keepLastRevisions, 10)
        if (!Number.isFinite(parsedCount) || parsedCount < 1) {
          throw new Error(t('invalidCount'))
        }
      }

      const payload =
        mode === 'date'
          ? {
              mode: 'date' as const,
              before: new Date(`${beforeDate}T00:00:00.000Z`).toISOString(),
              scope,
              ...(scope === 'namespace' ? { namespaceId: scopeId } : {}),
              ...(scope === 'app' ? { appId: scopeId } : {}),
            }
          : {
              mode: 'count' as const,
              keepLastRevisions: Number.parseInt(keepLastRevisions, 10),
              scope,
              ...(scope === 'namespace' ? { namespaceId: scopeId } : {}),
              ...(scope === 'app' ? { appId: scopeId } : {}),
            }

      const { response, body: rawBody } = await fetchJson(`${apiBase}/revisions/purge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = rawBody as PurgeRevisionsResponse & ApiErrorBody

      if (response.status === 401) {
        onUnauthorized()
        return
      }

      if (!response.ok) {
        throw new Error(body.error?.message ?? t('purgeFailed'))
      }

      setResult(body)
      onPurged?.()
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : t('purgeFailed'))
    } finally {
      setLoading(false)
    }
  }, [mode, beforeDate, keepLastRevisions, scope, scopeId, apiBase, onUnauthorized, onPurged, t])

  const canSubmit =
    mode === 'date'
      ? Boolean(beforeDate)
      : Number.isFinite(Number.parseInt(keepLastRevisions, 10)) &&
        Number.parseInt(keepLastRevisions, 10) >= 1

  const scopeHint =
    scope === 'deployment'
      ? t('scopeDeployment')
      : scope === 'namespace'
        ? t('scopeNamespace')
        : t('scopeApp')

  const isContentPending = !settingsLoaded

  const autoRetentionBlock = (
    <div className="operator-revisions-auto-retention">
      <p className="operator-revisions-auto-retention-label">{t('autoRetentionTitle')}</p>
      <ul className="operator-revisions-auto-retention-list">
        <li>
          {retentionDays && retentionDays > 0
            ? t('autoRetentionDays', { days: retentionDays })
            : t('autoRetentionDaysDisabled')}
        </li>
        <li>
          {retentionCount && retentionCount > 0
            ? t('autoRetentionCount', { count: retentionCount })
            : t('autoRetentionCountDisabled')}
        </li>
      </ul>
    </div>
  )

  const panelContent = (
    <>
      {variant === 'drawer' ? (
        <header className="operator-revisions-panel-header">
          <h4>{t('settingsTitle')}</h4>
          <p className="operator-muted">{t('settingsHint')}</p>
        </header>
      ) : title ? (
        <div className="operator-revisions-panel-target">
          <p className="operator-revisions-panel-target-title">{title}</p>
          {subtitle ? <p className="operator-muted">{subtitle}</p> : null}
          <p className="operator-muted">{scopeHint}</p>
        </div>
      ) : null}

      {variant === 'drawer' ? (
        <div className="operator-revisions-settings-slot">{autoRetentionBlock}</div>
      ) : (
        autoRetentionBlock
      )}

      <div className="operator-revisions-panel-form">
        <p className="operator-muted">{t('hint')}</p>

        <OperatorSegmentedField
          label={t('modeLabel')}
          value={mode}
          options={[
            { value: 'date', label: t('modeDate') },
            { value: 'count', label: t('modeCount') },
          ]}
          onChange={setMode}
        />

        {mode === 'date' ? (
          <div className="form-field">
            <label htmlFor="revision-purge-before">{t('beforeLabel')}</label>
            <input
              id="revision-purge-before"
              type="date"
              value={beforeDate}
              onChange={(event) => setBeforeDate(event.target.value)}
              required
            />
            <p className="operator-muted">{t('beforeHint')}</p>
          </div>
        ) : (
          <div className="form-field">
            <label htmlFor="revision-purge-count">{t('countLabel')}</label>
            <input
              id="revision-purge-count"
              type="number"
              min={1}
              max={10000}
              value={keepLastRevisions}
              onChange={(event) => setKeepLastRevisions(event.target.value)}
              required
            />
            <p className="operator-muted">{t('countHint')}</p>
          </div>
        )}
      </div>

      {error ? (
        <div className="operator-revisions-purge-feedback operator-revisions-purge-feedback--error" role="alert">
          {error}
        </div>
      ) : null}

      {result ? (
        <div
          className="operator-revisions-purge-feedback operator-revisions-purge-feedback--success"
          role="status"
        >
          {result.deletedRevisions === 0 && result.deletedBlobFiles === 0
            ? t('purgeSuccessNone')
            : t('purgeSuccess', {
                revisions: result.deletedRevisions,
                blobs: result.deletedBlobFiles,
              })}
        </div>
      ) : null}

      <div className="operator-revisions-panel-actions">
        {onCancel ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('cancel')}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading || !canSubmit}
          onClick={() => void handlePurge()}
        >
          {loading ? t('purging') : t('purgeButton')}
        </button>
      </div>
    </>
  )

  return (
    <div
      className={`operator-revisions-panel${
        variant === 'drawer' ? ' operator-revisions-panel--drawer' : ' operator-revisions-panel--modal'
      }${isContentPending && variant === 'drawer' ? ' is-loading' : ''}`}
    >
      {variant === 'drawer' && isContentPending ? (
        <div className="operator-revisions-drawer-loading" aria-live="polite" aria-busy="true">
          <OperatorSpinner label={t('loadingSettings')} />
        </div>
      ) : null}
      <div
        className={`operator-revisions-panel-content${isContentPending ? ' is-pending' : ''}`}
        aria-hidden={isContentPending ? true : undefined}
      >
        {panelContent}
      </div>
    </div>
  )
}
