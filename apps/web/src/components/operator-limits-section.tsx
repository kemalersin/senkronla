'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { OperatorSpinner } from '@/components/operator-spinner'

type LimitScope = 'namespaces' | 'apps' | 'developers'

type LimitKey =
  | 'recoverPerHour'
  | 'pairingPerHour'
  | 'pairingTokensPerHour'
  | 'pushPerHourPerDevice'
  | 'namespacesPerDay'
  | 'freeDeviceLimit'
  | 'purchasedSlots'

type LimitSource = 'namespace' | 'app' | 'developer' | 'row' | 'config'

interface LimitsResponse {
  effective: Record<LimitKey, number>
  sources: Record<LimitKey, LimitSource>
  overrides: {
    namespace: Record<string, number | null> | null
    app: Record<string, number | null> | null
    developer: Record<string, number | null> | null
  }
  configDefaults: Record<LimitKey, number>
}

interface ApiErrorBody {
  error?: { message?: string }
}

const LIMIT_KEYS: LimitKey[] = [
  'recoverPerHour',
  'pairingPerHour',
  'pairingTokensPerHour',
  'pushPerHourPerDevice',
  'namespacesPerDay',
  'freeDeviceLimit',
  'purchasedSlots',
]

interface OperatorLimitsSectionProps {
  scope: LimitScope
  scopeId: string
  apiBase?: string
  showHeader?: boolean
  onUnauthorized: () => void
}

async function readJson<T>(response: Response): Promise<T & ApiErrorBody> {
  return (await response.json()) as T & ApiErrorBody
}

export function OperatorLimitsSection({
  scope,
  scopeId,
  apiBase = '/api/operator',
  showHeader = true,
  onUnauthorized,
}: OperatorLimitsSectionProps) {
  const t = useTranslations('operator.limits')
  const [data, setData] = useState<LimitsResponse | null>(null)
  const [draft, setDraft] = useState<Partial<Record<LimitKey, string>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const limitsUrl = `${apiBase}/${scope}/${encodeURIComponent(scopeId)}/limits`

  const loadLimits = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(limitsUrl)
      if (response.status === 401) {
        onUnauthorized()
        return
      }

      const body = await readJson<LimitsResponse>(response)
      if (!response.ok) {
        setError(body.error?.message ?? t('loadFailed'))
        return
      }

      setData(body)
      setDraft({})
    } catch {
      setError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [limitsUrl, onUnauthorized, t])

  useEffect(() => {
    void loadLimits()
  }, [loadLimits])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!data) return

    setSaving(true)
    setError(null)
    setSaved(false)

    const patch: Record<string, number | null> = {}

    for (const key of LIMIT_KEYS) {
      const raw = draft[key]
      if (raw === undefined || raw === '') {
        continue
      }

      if (raw === 'inherit') {
        patch[key] = null
        continue
      }

      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError(t('invalidValue', { key: t(`keys.${key}`) }))
        setSaving(false)
        return
      }

      patch[key] = Math.floor(parsed)
    }

    if (Object.keys(patch).length === 0) {
      setSaving(false)
      return
    }

    try {
      const response = await fetch(limitsUrl, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })

      if (response.status === 401) {
        onUnauthorized()
        return
      }

      const body = await readJson<LimitsResponse>(response)
      if (!response.ok) {
        setError(body.error?.message ?? t('saveFailed'))
        return
      }

      setData(body)
      setDraft({})
      setSaved(true)
    } catch {
      setError(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function sourceLabel(source: LimitSource) {
    switch (source) {
      case 'namespace':
        return t('sources.namespace')
      case 'app':
        return t('sources.app')
      case 'developer':
        return t('sources.developer')
      case 'row':
        return t('sources.row')
      default:
        return t('sources.config')
    }
  }

  if (loading) {
    return <OperatorSpinner label={t('loading')} />
  }

  if (!data) {
    return error ? <div className="status-badge error">{error}</div> : null
  }

  return (
    <section className="operator-limits-section">
      {showHeader && (
        <header className="operator-limits-header">
          <h4>{t('title')}</h4>
          <p className="operator-muted">{t('hint')}</p>
        </header>
      )}

      <form className="operator-limits-form" onSubmit={(event) => void handleSave(event)}>
        <div className="operator-table-wrap">
          <table className="operator-table operator-limits-table">
            <thead>
              <tr>
                <th>{t('columns.key')}</th>
                <th className="operator-table-col-numeric">{t('columns.effective')}</th>
                <th>{t('columns.source')}</th>
                <th className="operator-table-col-numeric">{t('columns.override')}</th>
              </tr>
            </thead>
            <tbody>
              {LIMIT_KEYS.map((key) => {
                const scopeOverride =
                  scope === 'namespaces'
                    ? data.overrides.namespace?.[key]
                    : scope === 'apps'
                      ? data.overrides.app?.[key]
                      : data.overrides.developer?.[key]

                return (
                  <tr key={key}>
                    <td>{t(`keys.${key}`)}</td>
                    <td className="operator-table-col-numeric">
                      <code>{data.effective[key]}</code>
                    </td>
                    <td>{sourceLabel(data.sources[key])}</td>
                    <td className="operator-table-col-numeric">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="operator-limits-input"
                        placeholder={
                          scopeOverride != null
                            ? String(scopeOverride)
                            : String(data.configDefaults[key])
                        }
                        aria-label={t('columns.overrideFor', { key: t(`keys.${key}`) })}
                        value={draft[key] ?? ''}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, [key]: event.target.value }))
                        }
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="operator-limits-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
          {saved && <span className="operator-pill operator-pill-ok">{t('saved')}</span>}
          {error && <span className="status-badge error">{error}</span>}
        </div>
      </form>
    </section>
  )
}
