'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { OperatorSpinner } from '@/components/operator-spinner'

type LimitScope = 'namespaces' | 'apps' | 'developers' | 'settings'

type LimitKey =
  | 'recoverPerHour'
  | 'pairingPerHour'
  | 'pairingTokensPerHour'
  | 'pushPerHourPerDevice'
  | 'namespacesPerDay'
  | 'freeDeviceLimit'
  | 'purchasedSlots'

type LimitSource = 'namespace' | 'app' | 'developer' | 'operator' | 'row' | 'env' | 'config'

interface LimitsResponse {
  effective: Record<LimitKey, number>
  sources: Record<LimitKey, LimitSource>
  overrides: {
    namespace?: Record<string, number | null> | null
    app?: Record<string, number | null> | null
    developer?: Record<string, number | null> | null
    operator?: Record<string, number | null> | null
  }
  configDefaults: Record<LimitKey, number>
  envDefaults?: Partial<Record<LimitKey, number>>
  inheritDefaults?: Record<LimitKey, number>
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
  scopeId?: string
  apiBase?: string
  showHeader?: boolean
  onUnauthorized: () => void
}

async function readJson<T>(response: Response): Promise<T & ApiErrorBody> {
  return (await response.json()) as T & ApiErrorBody
}

function limitsUrlForScope(apiBase: string, scope: LimitScope, scopeId?: string) {
  if (scope === 'settings') {
    return `${apiBase}/settings/limits`
  }

  return `${apiBase}/${scope}/${encodeURIComponent(scopeId ?? '')}/limits`
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
  const [pendingClear, setPendingClear] = useState<Partial<Record<LimitKey, boolean>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const limitsUrl = limitsUrlForScope(apiBase, scope, scopeId)

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
      setPendingClear({})
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
      if (pendingClear[key]) {
        patch[key] = null
        continue
      }

      const raw = draft[key]
      if (raw === undefined || raw === '') {
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
      setPendingClear({})
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
      case 'operator':
        return t('sources.operator')
      case 'row':
        return t('sources.row')
      case 'env':
        return t('sources.env')
      default:
        return t('sources.config')
    }
  }

  function scopeOverrideForKey(key: LimitKey) {
    if (!data) return undefined

    switch (scope) {
      case 'settings':
        return data.overrides.operator?.[key]
      case 'namespaces':
        return data.overrides.namespace?.[key]
      case 'apps':
        return data.overrides.app?.[key]
      case 'developers':
        return data.overrides.developer?.[key]
    }
  }

  function inheritPlaceholder(key: LimitKey) {
    if (!data) return ''

    if (data.inheritDefaults?.[key] !== undefined) {
      return String(data.inheritDefaults[key])
    }

    if (data.envDefaults?.[key] !== undefined) {
      return String(data.envDefaults[key])
    }

    return String(data.configDefaults[key])
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
          <h4>{scope === 'settings' ? t('globalTitle') : t('title')}</h4>
          <p className="operator-muted">{scope === 'settings' ? t('globalHint') : t('hint')}</p>
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
                const scopeOverride = scopeOverrideForKey(key)
                const hasScopeOverride = scopeOverride !== undefined && scopeOverride !== null
                const willClear = Boolean(pendingClear[key])

                return (
                  <tr key={key} className={willClear ? 'operator-limits-row--clearing' : undefined}>
                    <td>{t(`keys.${key}`)}</td>
                    <td className="operator-table-col-numeric">
                      <code>{data.effective[key]}</code>
                    </td>
                    <td>{sourceLabel(data.sources[key])}</td>
                    <td className="operator-table-col-numeric">
                      <div className="operator-limits-override-cell">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="operator-limits-input"
                          placeholder={
                            hasScopeOverride && !willClear
                              ? String(scopeOverride)
                              : inheritPlaceholder(key)
                          }
                          aria-label={t('columns.overrideFor', { key: t(`keys.${key}`) })}
                          value={draft[key] ?? ''}
                          disabled={willClear}
                          onChange={(event) => {
                            const value = event.target.value
                            setDraft((current) => ({ ...current, [key]: value }))
                            if (value !== '') {
                              setPendingClear((current) => {
                                if (!current[key]) return current
                                const next = { ...current }
                                delete next[key]
                                return next
                              })
                            }
                          }}
                        />
                        {(hasScopeOverride || willClear) && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm operator-limits-clear"
                            disabled={saving}
                            onClick={() => {
                              if (willClear) {
                                setPendingClear((current) => {
                                  const next = { ...current }
                                  delete next[key]
                                  return next
                                })
                                return
                              }
                              setPendingClear((current) => ({ ...current, [key]: true }))
                              setDraft((current) => {
                                const next = { ...current }
                                delete next[key]
                                return next
                              })
                            }}
                          >
                            {willClear ? t('undoClearOverride') : t('clearOverride')}
                          </button>
                        )}
                      </div>
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
