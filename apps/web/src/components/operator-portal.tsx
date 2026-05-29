'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { OperatorAppsPanel } from '@/components/operator-apps-panel'
import { OperatorDevelopersPanel } from '@/components/operator-developers-panel'
import { OperatorSpinner } from '@/components/operator-spinner'
import { getPublicApiOrigin } from '@/lib/public-api-url'

type Tab = 'overview' | 'namespaces' | 'unlockCodes' | 'unlockEvents' | 'rateLimits' | 'apps' | 'developers'

interface Paginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

interface Overview {
  namespaces: number
  activeDevices: number
  revokedDevices: number
  documents: number
  pendingUnlockCodes: number
  redeemedUnlockCodes: number
  unlockEvents: number
  rateLimitEvents: number
  activePairingTokens: number
}

interface HealthResponse {
  status: 'ok' | 'degraded'
  version: string
  database: { status: string; mode: string }
  blob: { status: string }
  websocket: boolean
}

interface NamespaceRow {
  namespaceId: string
  namespaceLabel: string
  freeDeviceLimit: number
  purchasedSlots: number
  activeDevices: number
  createdAt: string
  documentCount: number
  documentRevision: string | null
  documentWrittenAt: string | null
  documentSizeBytes: number | null
}

interface UnlockCodeRow {
  code: string
  namespaceId: string
  slots: number
  expiresAt: string | null
  redeemedAt: string | null
  note: string | null
  createdAt: string
}

interface UnlockEventRow {
  id: string
  namespaceId: string
  namespaceLabel: string
  slotsAdded: number
  source: string
  unlockCode: string | null
  createdAt: string
}

interface RateLimitGroupRow {
  action: string
  namespaceId: string | null
  clientDeviceId: string | null
  clientIp: string | null
  periodStart: string
  periodEnd: string
  count: number
}

interface ApiErrorBody {
  error?: { message?: string }
}

const PAGE_SIZE = 20

const RATE_LIMIT_FILTER_ACTIONS = [
  'recover',
  'pair_device',
  'pairing_token',
  'put_document',
] as const

interface ListFetchOptions {
  q?: string
  action?: string
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatPeriod(startIso: string, endIso: string, locale: string) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const sameDay = start.toLocaleDateString(locale) === end.toLocaleDateString(locale)

  if (sameDay) {
    return `${start.toLocaleDateString(locale)} ${start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
  }

  return `${formatDate(startIso, locale)} – ${formatDate(endIso, locale)}`
}

function rateLimitGroupKey(row: RateLimitGroupRow) {
  return `${row.action}:${row.namespaceId ?? ''}:${row.clientDeviceId ?? ''}:${row.clientIp ?? ''}:${row.periodStart}`
}

function rateLimitActionLabel(
  action: string,
  t: ReturnType<typeof useTranslations<'operator'>>,
) {
  switch (action) {
    case 'global_ip':
      return t('rateLimitActions.global_ip')
    case 'recover':
      return t('rateLimitActions.recover')
    case 'pair_device':
      return t('rateLimitActions.pair_device')
    case 'pairing_token':
      return t('rateLimitActions.pairing_token')
    case 'put_document':
      return t('rateLimitActions.put_document')
    default:
      return action
  }
}

async function readJson<T>(response: Response): Promise<T & ApiErrorBody> {
  return (await response.json()) as T & ApiErrorBody
}

export function OperatorPortal() {
  const t = useTranslations('operator')
  const locale = useLocale()
  const apiOrigin = getPublicApiOrigin()

  const [authState, setAuthState] = useState<'loading' | 'guest' | 'authenticated'>('loading')
  const [loginToken, setLoginToken] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [namespaces, setNamespaces] = useState<Paginated<NamespaceRow> | null>(null)
  const [unlockCodes, setUnlockCodes] = useState<Paginated<UnlockCodeRow> | null>(null)
  const [unlockEvents, setUnlockEvents] = useState<Paginated<UnlockEventRow> | null>(null)
  const [rateLimits, setRateLimits] = useState<Paginated<RateLimitGroupRow> | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [rateLimitAction, setRateLimitAction] = useState('')

  const [generateNamespaceId, setGenerateNamespaceId] = useState('')
  const [generateSlots, setGenerateSlots] = useState('3')
  const [generateNote, setGenerateNote] = useState('')
  const [generateLoading, setGenerateLoading] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)

  const checkSession = useCallback(async () => {
    const response = await fetch('/api/operator/auth/session')
    setAuthState(response.ok ? 'authenticated' : 'guest')
  }, [])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (authState !== 'authenticated' || tab === 'overview') {
      return
    }

    setPage(0)
  }, [debouncedSearch, rateLimitAction, authState, tab])

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [overviewResponse, healthResponse] = await Promise.all([
        fetch('/api/operator/overview'),
        fetch('/api/operator/health'),
      ])

      if (overviewResponse.status === 401 || healthResponse.status === 401) {
        setAuthState('guest')
        return
      }

      const overviewBody = await readJson<Overview>(overviewResponse)
      const healthBody = await readJson<HealthResponse>(healthResponse)

      if (!overviewResponse.ok) {
        throw new Error(overviewBody.error?.message ?? t('loadFailed'))
      }

      setOverview(overviewBody)
      setHealth(healthResponse.ok ? healthBody : null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadPaginated = useCallback(
    async (path: string, pageIndex: number, options: ListFetchOptions = {}) => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(pageIndex * PAGE_SIZE),
        })

        if (options.q) {
          params.set('q', options.q)
        }

        if (options.action) {
          params.set('action', options.action)
        }

        const response = await fetch(`${path}?${params.toString()}`)

        if (response.status === 401) {
          setAuthState('guest')
          return null
        }

        const body = await readJson<Paginated<unknown>>(response)

        if (!response.ok) {
          throw new Error(body.error?.message ?? t('loadFailed'))
        }

        return body as Paginated<NamespaceRow> &
          Paginated<UnlockCodeRow> &
          Paginated<UnlockEventRow> &
          Paginated<RateLimitGroupRow>
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t('loadFailed'))
        return null
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    if (authState !== 'authenticated') {
      return
    }

    setError(null)
    setLoading(true)

    if (tab === 'overview') {
      void loadOverview()
      return
    }

    void (async () => {
      const listOptions: ListFetchOptions = {
        q: debouncedSearch || undefined,
        action: tab === 'rateLimits' && rateLimitAction ? rateLimitAction : undefined,
      }

      if (tab === 'namespaces') {
        setNamespaces((await loadPaginated('/api/operator/namespaces', page, listOptions)) as Paginated<NamespaceRow> | null)
      } else if (tab === 'unlockCodes') {
        setUnlockCodes((await loadPaginated('/api/operator/unlock-codes', page, listOptions)) as Paginated<UnlockCodeRow> | null)
      } else if (tab === 'unlockEvents') {
        setUnlockEvents((await loadPaginated('/api/operator/unlock-events', page, listOptions)) as Paginated<UnlockEventRow> | null)
      } else if (tab === 'rateLimits') {
        setRateLimits((await loadPaginated('/api/operator/rate-limit-events', page, listOptions)) as Paginated<RateLimitGroupRow> | null)
      }
    })()
  }, [authState, tab, page, debouncedSearch, rateLimitAction, loadOverview, loadPaginated])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginLoading(true)
    setLoginError(null)

    try {
      const response = await fetch('/api/operator/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adminToken: loginToken }),
      })

      const body = await readJson<{ ok?: boolean }>(response)

      if (!response.ok) {
        setLoginError(body.error?.message ?? t('loginFailed'))
        return
      }

      setLoginToken('')
      setAuthState('authenticated')
    } catch {
      setLoginError(t('loginFailed'))
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/operator/auth/logout', { method: 'POST' })
    setAuthState('guest')
    setOverview(null)
    setHealth(null)
    setNamespaces(null)
    setUnlockCodes(null)
    setUnlockEvents(null)
    setRateLimits(null)
  }

  async function handleGenerateUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGenerateLoading(true)
    setGenerateError(null)
    setGeneratedCode(null)

    try {
      const response = await fetch('/api/operator/unlock-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          namespaceId: generateNamespaceId.trim(),
          slots: Number(generateSlots),
          ...(generateNote.trim() ? { note: generateNote.trim() } : {}),
        }),
      })

      const body = await readJson<{ unlockCode?: string }>(response)

      if (!response.ok) {
        setGenerateError(body.error?.message ?? t('requestFailed'))
        return
      }

      setGeneratedCode(body.unlockCode ?? null)
      setGenerateNote('')
      if (tab === 'unlockCodes') {
        setUnlockCodes((await loadPaginated('/api/operator/unlock-codes', page, {
          q: debouncedSearch || undefined,
        })) as Paginated<UnlockCodeRow> | null)
      }
      void loadOverview()
    } catch {
      setGenerateError(t('requestFailed'))
    } finally {
      setGenerateLoading(false)
    }
  }

  function renderListToolbar() {
    return (
      <div className="operator-list-toolbar">
        <div className="form-field operator-search-field">
          <label htmlFor="operator-list-search">{t('searchLabel')}</label>
          <input
            id="operator-list-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('searchPlaceholder')}
          />
        </div>
        {tab === 'rateLimits' && (
          <div className="operator-action-filters" role="group" aria-label={t('filterByAction')}>
            <button
              type="button"
              className="operator-action-filter"
              data-active={rateLimitAction === '' ? 'true' : 'false'}
              onClick={() => setRateLimitAction('')}
            >
              {t('filterAllActions')}
            </button>
            {RATE_LIMIT_FILTER_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                className="operator-action-filter"
                data-active={rateLimitAction === action ? 'true' : 'false'}
                onClick={() => setRateLimitAction(action)}
              >
                {rateLimitActionLabel(action, t)}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderListBody(content: ReactNode, total: number) {
    if (loading) {
      return <OperatorSpinner label={t('loading')} />
    }

    return (
      <>
        {content}
        {renderPagination(total)}
      </>
    )
  }

  function renderPagination(total: number) {
    const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1)

    if (totalPages <= 1) {
      return null
    }

    const showPrev = page > 0
    const showNext = page + 1 < totalPages

    return (
      <div className="operator-pagination">
        <span>{t('pagination', { page: page + 1, total: totalPages, count: total })}</span>
        {(showPrev || showNext) && (
          <div className="operator-pagination-actions">
            {showPrev && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading}
                onClick={() => setPage((current) => Math.max(current - 1, 0))}
              >
                {t('prevPage')}
              </button>
            )}
            {showNext && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading}
                onClick={() => setPage((current) => current + 1)}
              >
                {t('nextPage')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (authState === 'guest') {
    return (
      <div className="operator-shell operator-login">
        <div className="operator-login-card card">
          <h1>{t('title')}</h1>
          <p className="operator-muted">{t('loginIntro')}</p>
          <p className="operator-api-origin">{apiOrigin}</p>

          <form onSubmit={handleLogin}>
            <div className="form-field">
              <label htmlFor="operator-login-token">{t('adminToken')}</label>
              <input
                id="operator-login-token"
                type="password"
                autoComplete="off"
                placeholder="ESR_ADMIN_TOKEN"
                value={loginToken}
                onChange={(event) => setLoginToken(event.target.value)}
                required
              />
              <span className="form-hint">{t('adminTokenHint')}</span>
            </div>

            <button type="submit" className="btn btn-primary" disabled={loginLoading}>
              {loginLoading ? t('loggingIn') : t('login')}
            </button>
          </form>

          {loginError && <div className="status-badge error">{loginError}</div>}
        </div>
      </div>
    )
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: t('tabs.overview') },
    { id: 'namespaces', label: t('tabs.namespaces') },
    { id: 'apps', label: t('tabs.apps') },
    { id: 'developers', label: t('tabs.developers') },
    { id: 'unlockCodes', label: t('tabs.unlockCodes') },
    { id: 'unlockEvents', label: t('tabs.unlockEvents') },
    { id: 'rateLimits', label: t('tabs.rateLimits') },
  ]

  const showOverviewSpinner = tab === 'overview' && (authState === 'loading' || loading)
  const isListTab = tab !== 'overview' && tab !== 'apps' && tab !== 'developers'

  function renderTabContent() {
    if (error) {
      return (
        <div className="operator-content">
          <div className="status-badge error">{error}</div>
        </div>
      )
    }

    if (tab === 'overview') {
      return (
        <section className="operator-content operator-section">
          {overview && (
            <div className="operator-stats">
              {[
                { label: t('stats.namespaces'), value: overview.namespaces },
                { label: t('stats.activeDevices'), value: overview.activeDevices },
                { label: t('stats.documents'), value: overview.documents },
                { label: t('stats.pendingCodes'), value: overview.pendingUnlockCodes },
                { label: t('stats.unlockEvents'), value: overview.unlockEvents },
                { label: t('stats.rateLimitEvents'), value: overview.rateLimitEvents },
              ].map((stat) => (
                <article key={stat.label} className="operator-stat card">
                  <p className="operator-stat-label">{stat.label}</p>
                  <p className="operator-stat-value">{stat.value}</p>
                </article>
              ))}
            </div>
          )}

          {health && (
            <div className="card operator-health-card">
              <div className="operator-health-row">
                <span className={`status-badge ${health.status === 'ok' ? 'ok' : 'error'}`}>
                  {health.status === 'ok' ? t('statusOk') : t('statusDegraded')}
                </span>
                <span className="operator-muted">
                  {t('version')}: {health.version} · {t('databaseMode')}: {health.database.mode} ·{' '}
                  {t('websocket')}: {health.websocket ? t('websocketEnabled') : t('websocketDisabled')}
                </span>
              </div>
            </div>
          )}

          <div className="card operator-generate-card">
            <h2>{t('unlock')}</h2>
            <p className="operator-muted">{t('unlockHint')}</p>
            <form className="operator-generate-form" onSubmit={handleGenerateUnlock}>
              <div className="form-field">
                <label htmlFor="generate-namespace">{t('namespaceId')}</label>
                <input
                  id="generate-namespace"
                  value={generateNamespaceId}
                  onChange={(event) => setGenerateNamespaceId(event.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="generate-slots">{t('slots')}</label>
                <input
                  id="generate-slots"
                  type="number"
                  min={1}
                  max={999}
                  value={generateSlots}
                  onChange={(event) => setGenerateSlots(event.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="generate-note">{t('note')}</label>
                <input
                  id="generate-note"
                  value={generateNote}
                  onChange={(event) => setGenerateNote(event.target.value)}
                  placeholder={t('notePlaceholder')}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={generateLoading}>
                {generateLoading ? t('generating') : t('generateUnlock')}
              </button>
            </form>
            {generateError && <div className="status-badge error">{generateError}</div>}
            {generatedCode && (
              <div className="operator-generated-code">
                <span className="operator-muted">{t('unlockCode')}</span>
                <code>{generatedCode}</code>
              </div>
            )}
          </div>
        </section>
      )
    }

    if (tab === 'namespaces' && namespaces) {
      return (
        <section className="operator-content operator-section card">
          {renderListBody(
            namespaces.items.length === 0 ? (
              <p className="operator-empty">{t('noResults')}</p>
            ) : (
              <div className="operator-table-wrap">
                <table className="operator-table">
                  <thead>
                    <tr>
                      <th>{t('columns.namespace')}</th>
                      <th>{t('columns.label')}</th>
                      <th>{t('columns.devices')}</th>
                      <th>{t('columns.slots')}</th>
                      <th>{t('columns.documentCount')}</th>
                      <th>{t('columns.primaryHead')}</th>
                      <th>{t('columns.created')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {namespaces.items.map((row) => (
                      <tr key={row.namespaceId}>
                        <td><code>{row.namespaceId}</code></td>
                        <td>{row.namespaceLabel}</td>
                        <td>{row.activeDevices}</td>
                        <td>{row.freeDeviceLimit + row.purchasedSlots}</td>
                        <td>{row.documentCount}</td>
                        <td>
                          {row.documentRevision
                            ? `${row.documentRevision.slice(0, 8)}… (${formatBytes(row.documentSizeBytes ?? 0)})`
                            : '—'}
                        </td>
                        <td>{formatDate(row.createdAt, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
            namespaces.total,
          )}
        </section>
      )
    }

    if (tab === 'unlockCodes' && unlockCodes) {
      return (
        <section className="operator-content operator-section card">
          {renderListBody(
            unlockCodes.items.length === 0 ? (
              <p className="operator-empty">{t('noResults')}</p>
            ) : (
              <div className="operator-table-wrap">
                <table className="operator-table">
                  <thead>
                    <tr>
                      <th>{t('columns.code')}</th>
                      <th>{t('columns.namespace')}</th>
                      <th>{t('columns.slots')}</th>
                      <th>{t('columns.status')}</th>
                      <th>{t('columns.note')}</th>
                      <th>{t('columns.created')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unlockCodes.items.map((row) => (
                      <tr key={row.code}>
                        <td><code>{row.code}</code></td>
                        <td><code>{row.namespaceId}</code></td>
                        <td>{row.slots}</td>
                        <td>{row.redeemedAt ? t('statusRedeemed') : t('statusPending')}</td>
                        <td>{row.note ?? '—'}</td>
                        <td>{formatDate(row.createdAt, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
            unlockCodes.total,
          )}
        </section>
      )
    }

    if (tab === 'unlockEvents' && unlockEvents) {
      return (
        <section className="operator-content operator-section card">
          {renderListBody(
            unlockEvents.items.length === 0 ? (
              <p className="operator-empty">{t('noResults')}</p>
            ) : (
              <div className="operator-table-wrap">
                <table className="operator-table">
                  <thead>
                    <tr>
                      <th>{t('columns.namespace')}</th>
                      <th>{t('columns.label')}</th>
                      <th>{t('columns.slots')}</th>
                      <th>{t('columns.source')}</th>
                      <th>{t('columns.code')}</th>
                      <th>{t('columns.created')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unlockEvents.items.map((row) => (
                      <tr key={row.id}>
                        <td><code>{row.namespaceId}</code></td>
                        <td>{row.namespaceLabel}</td>
                        <td>{row.slotsAdded}</td>
                        <td>{row.source}</td>
                        <td>{row.unlockCode ? <code>{row.unlockCode}</code> : '—'}</td>
                        <td>{formatDate(row.createdAt, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
            unlockEvents.total,
          )}
        </section>
      )
    }

    if (tab === 'rateLimits' && rateLimits) {
      return (
        <section className="operator-content operator-section card">
          {renderListBody(
            rateLimits.items.length === 0 ? (
              <p className="operator-empty">{t('noResults')}</p>
            ) : (
              <div className="operator-table-wrap">
                <table className="operator-table">
                  <thead>
                    <tr>
                      <th>{t('columns.action')}</th>
                      <th>{t('columns.namespace')}</th>
                      <th>{t('columns.device')}</th>
                      <th>{t('columns.ip')}</th>
                      <th>{t('columns.period')}</th>
                      <th>{t('columns.count')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateLimits.items.map((row) => (
                      <tr key={rateLimitGroupKey(row)}>
                        <td><code>{rateLimitActionLabel(row.action, t)}</code></td>
                        <td>{row.namespaceId ? <code>{row.namespaceId}</code> : '—'}</td>
                        <td>{row.clientDeviceId ?? '—'}</td>
                        <td>{row.clientIp ?? '—'}</td>
                        <td>{formatPeriod(row.periodStart, row.periodEnd, locale)}</td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
            rateLimits.total,
          )}
        </section>
      )
    }

    if (tab === 'apps') {
      return (
        <OperatorAppsPanel
          authState={authState}
          page={page}
          onUnauthorized={() => setAuthState('guest')}
          onPageChange={setPage}
        />
      )
    }

    if (tab === 'developers') {
      return (
        <OperatorDevelopersPanel
          authState={authState}
          page={page}
          onUnauthorized={() => setAuthState('guest')}
          onPageChange={setPage}
        />
      )
    }

    if (isListTab) {
      return (
        <section className="operator-content operator-section card">
          <OperatorSpinner label={t('loading')} />
        </section>
      )
    }

    return <OperatorSpinner label={t('loading')} />
  }

  return (
    <div className="operator-shell">
      <header className="operator-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="operator-muted">{t('intro')}</p>
        </div>
        <div className="operator-header-actions">
          <span className="operator-api-origin">{apiOrigin}</span>
          {authState === 'authenticated' && (
            <button type="button" className="btn btn-secondary" onClick={() => void handleLogout()}>
              {t('logout')}
            </button>
          )}
        </div>
      </header>

      <nav className="operator-tabs" aria-label={t('title')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className="operator-tab"
            data-active={tab === item.id ? 'true' : 'false'}
            disabled={authState === 'loading'}
            onClick={() => {
              if (item.id !== tab) {
                setPage(0)
                setSearchQuery('')
                setDebouncedSearch('')
                setRateLimitAction('')
              }
              setTab(item.id)
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {isListTab && renderListToolbar()}

      {showOverviewSpinner ? <OperatorSpinner label={t('loading')} /> : renderTabContent()}
    </div>
  )
}
