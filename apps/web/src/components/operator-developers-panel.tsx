'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { DocCallout } from '@/components/doc-callout'
import { OperatorSpinner } from '@/components/operator-spinner'
import {
  OperatorLimitsModal,
  type OperatorLimitsTarget,
} from '@/components/operator-limits-modal'
import { Link } from '@/i18n/navigation'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'
import { dedupedGet, fetchJson } from '@/lib/deduped-fetch'
import { withDocRich } from '@/lib/doc-rich-text'

interface Paginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

interface DeveloperRow {
  id: string
  email: string
  emailVerified: boolean
  disabled: boolean
  disabledAt: string | null
  appCount: number
  createdAt: string
}

interface ApiErrorBody {
  error?: { message?: string }
}

const PAGE_SIZE = 20
const DEVELOPERS_PREREQUISITES_DISMISSED_KEY = 'senkronla-operator-developers-prerequisites-dismissed'

const DEVELOPER_FILTERS = ['all', 'verified', 'unverified', 'disabled'] as const
type DeveloperFilter = (typeof DEVELOPER_FILTERS)[number]

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function readJson<T>(response: Response): Promise<T & ApiErrorBody> {
  return (await response.json()) as T & ApiErrorBody
}

function accountStatusLabel(
  developer: DeveloperRow,
  t: ReturnType<typeof useTranslations<'operator'>>,
) {
  if (developer.disabled) {
    return t('developers.statusDisabled')
  }

  if (developer.emailVerified) {
    return t('developers.statusVerified')
  }

  return t('developers.statusUnverified')
}

function accountStatusPillClass(developer: DeveloperRow) {
  if (developer.disabled) return 'operator-pill operator-pill-warn'
  if (developer.emailVerified) return 'operator-pill operator-pill-ok'
  return 'operator-pill'
}

interface OperatorDevelopersPanelProps {
  authState: 'loading' | 'guest' | 'authenticated'
  page: number
  listRefreshKey?: number
  onNavigateToApps?: (developerId: string, email: string) => void
  onUnauthorized: () => void
  onPageChange: (page: number) => void
}

export function OperatorDevelopersPanel({
  authState,
  page,
  listRefreshKey = 0,
  onNavigateToApps,
  onUnauthorized,
  onPageChange,
}: OperatorDevelopersPanelProps) {
  const t = useTranslations('operator')
  const locale = useLocale()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [developers, setDevelopers] = useState<Paginated<DeveloperRow> | null>(null)
  const [filter, setFilter] = useState<DeveloperFilter>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDeveloper, setSelectedDeveloper] = useState<DeveloperRow | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [limitsTarget, setLimitsTarget] = useState<OperatorLimitsTarget | null>(null)
  const [prerequisitesDismissed, setPrerequisitesDismissed] = useState(false)
  const [prerequisitesReady, setPrerequisitesReady] = useState(false)
  const loadDevelopersRequestId = useRef(0)
  const tRef = useRef(t)
  tRef.current = t
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized
  const listQueryRef = useRef({ debouncedSearch, filter, page })
  listQueryRef.current = { debouncedSearch, filter, page }

  useEffect(() => {
    try {
      setPrerequisitesDismissed(localStorage.getItem(DEVELOPERS_PREREQUISITES_DISMISSED_KEY) === '1')
    } catch {
      setPrerequisitesDismissed(false)
    }

    setPrerequisitesReady(true)
  }, [])

  const dismissPrerequisites = useCallback(() => {
    setPrerequisitesDismissed(true)

    try {
      localStorage.setItem(DEVELOPERS_PREREQUISITES_DISMISSED_KEY, '1')
    } catch {
      // ignore storage errors
    }
  }, [])

  const filterLabel = useCallback(
    (value: DeveloperFilter) => {
      switch (value) {
        case 'verified':
          return t('developers.filterVerified')
        case 'unverified':
          return t('developers.filterUnverified')
        case 'disabled':
          return t('developers.filterDisabled')
        default:
          return t('developers.filterAll')
      }
    },
    [t],
  )

  useEffect(() => {
    if (searchQuery.trim() === debouncedSearch) {
      return
    }

    const timer = window.setTimeout(() => {
      onPageChange(0)
      setDebouncedSearch(searchQuery.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [debouncedSearch, onPageChange, searchQuery])

  const loadDevelopers = useCallback(async (options?: { dedupe?: boolean }) => {
    const requestId = ++loadDevelopersRequestId.current
    const query = listQueryRef.current
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(query.page * PAGE_SIZE),
      })

      if (query.debouncedSearch) {
        params.set('q', query.debouncedSearch)
      }

      if (query.filter !== 'all') {
        params.set('filter', query.filter)
      }

      const url = `/api/operator/developers?${params.toString()}`
      const { response, body: rawBody } = options?.dedupe
        ? await dedupedGet(url)
        : await fetchJson(url)
      const body = rawBody as Paginated<DeveloperRow> & ApiErrorBody

      if (requestId !== loadDevelopersRequestId.current) {
        return
      }

      if (response.status === 401) {
        onUnauthorizedRef.current()
        return
      }

      if (requestId !== loadDevelopersRequestId.current) {
        return
      }

      if (!response.ok) {
        throw new Error(body.error?.message ?? tRef.current('loadFailed'))
      }

      setDevelopers(body)
    } catch (loadError) {
      if (requestId !== loadDevelopersRequestId.current) {
        return
      }

      setError(loadError instanceof Error ? loadError.message : tRef.current('loadFailed'))
    } finally {
      if (requestId === loadDevelopersRequestId.current) {
        setLoading(false)
      }
    }
  }, [])

  const loadDeveloperDetail = useCallback(
    async (developerId: string) => {
      setDetailError(null)
      setActionError(null)

      try {
        const response = await fetch(`/api/operator/developers/${encodeURIComponent(developerId)}`)

        if (response.status === 401) {
          onUnauthorized()
          return
        }

        const body = await readJson<DeveloperRow>(response)

        if (!response.ok) {
          throw new Error(body.error?.message ?? t('loadFailed'))
        }

        setSelectedDeveloper(body)
      } catch (loadError) {
        setSelectedId(null)
        setSelectedDeveloper(null)
        setDetailError(loadError instanceof Error ? loadError.message : t('loadFailed'))
      }
    },
    [onUnauthorized, t],
  )

  function selectDeveloper(developerId: string) {
    if (selectedDeveloper?.id === developerId) {
      closeDetailPanel()
      return
    }

    setSelectedId(developerId)
    setSelectedDeveloper(null)
    setDetailError(null)
    setActionError(null)
  }

  useEffect(() => {
    if (authState !== 'authenticated') {
      return
    }

    void loadDevelopers({ dedupe: true })
  }, [authState, debouncedSearch, filter, loadDevelopers, page])

  useEffect(() => {
    if (authState !== 'authenticated' || listRefreshKey === 0) {
      return
    }

    setDevelopers(null)
    setSelectedId(null)
    setSelectedDeveloper(null)
    setDetailError(null)
    setActionError(null)
    void loadDevelopers()
  }, [authState, listRefreshKey, loadDevelopers])

  useEffect(() => {
    if (!selectedId || selectedDeveloper?.id === selectedId) {
      return
    }

    void loadDeveloperDetail(selectedId)
  }, [loadDeveloperDetail, selectedDeveloper?.id, selectedId])

  function closeDetailPanel() {
    setSelectedId(null)
    setSelectedDeveloper(null)
    setActionError(null)
    setDetailError(null)
  }

  usePageScrollLock(Boolean(selectedDeveloper), 'operator-developers-drawer')

  useEffect(() => {
    if (!selectedDeveloper) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDetailPanel()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedDeveloper])

  async function patchDeveloper(patch: { disabled?: boolean; emailVerified?: boolean }) {
    if (!selectedDeveloper) return

    setActionLoading(true)
    setActionError(null)

    try {
      const response = await fetch(
        `/api/operator/developers/${encodeURIComponent(selectedDeveloper.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })

      const body = await readJson<DeveloperRow>(response)

      if (!response.ok) {
        setActionError(body.error?.message ?? t('requestFailed'))
        return
      }

      setSelectedDeveloper(body)
      await loadDevelopers()
    } catch {
      setActionError(t('requestFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  function renderListBody(content: ReactNode, total: number) {
    if (!developers && loading) {
      return <OperatorSpinner label={t('loading')} />
    }

    if (!developers) {
      return null
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
                onClick={() => onPageChange(Math.max(page - 1, 0))}
              >
                {t('prevPage')}
              </button>
            )}
            {showNext && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading}
                onClick={() => onPageChange(page + 1)}
              >
                {t('nextPage')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderDetailDrawer() {
    if (!selectedDeveloper) {
      return null
    }

    return (
      <>
        <button
          type="button"
          className="operator-apps-drawer-backdrop"
          aria-label={t('developers.closeDetail')}
          onClick={closeDetailPanel}
        />
        <aside
          className="operator-apps-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="operator-developers-drawer-title"
        >
          <header className="operator-apps-drawer-header">
            <div className="operator-apps-drawer-heading">
              <h3 id="operator-developers-drawer-title">{selectedDeveloper.email}</h3>
              <div className="operator-apps-drawer-badges">
                <span className={accountStatusPillClass(selectedDeveloper)}>
                  {accountStatusLabel(selectedDeveloper, t)}
                </span>
                <span className="operator-pill">
                  {t('developers.apps')}: {selectedDeveloper.appCount}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="operator-apps-drawer-close"
              aria-label={t('developers.closeDetail')}
              onClick={closeDetailPanel}
            >
              ×
            </button>
          </header>

          <div className="operator-apps-drawer-toolbar">
            {!selectedDeveloper.emailVerified && !selectedDeveloper.disabled && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={actionLoading}
                  onClick={() => void patchDeveloper({ emailVerified: true })}
                >
                  {t('developers.verifyEmail')}
                </button>
              )}
              {selectedDeveloper.emailVerified && !selectedDeveloper.disabled && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={actionLoading}
                  onClick={() => void patchDeveloper({ emailVerified: false })}
                >
                  {t('developers.revokeVerification')}
                </button>
              )}
              {!selectedDeveloper.disabled ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={actionLoading}
                  onClick={() => void patchDeveloper({ disabled: true })}
                >
                  {t('developers.disable')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={actionLoading}
                  onClick={() => void patchDeveloper({ disabled: false })}
                >
                  {t('developers.enable')}
                </button>
              )}
          </div>

          <div className="operator-apps-drawer-body">
            <dl className="operator-apps-meta">
                <div>
                  <dt>{t('developers.email')}</dt>
                  <dd>{selectedDeveloper.email}</dd>
                </div>
                <div>
                  <dt>{t('columns.status')}</dt>
                  <dd>
                    <span className={accountStatusPillClass(selectedDeveloper)}>
                      {accountStatusLabel(selectedDeveloper, t)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t('developers.apps')}</dt>
                  <dd>{selectedDeveloper.appCount}</dd>
                </div>
                <div>
                  <dt>{t('columns.created')}</dt>
                  <dd>{formatDate(selectedDeveloper.createdAt, locale)}</dd>
                </div>
                {selectedDeveloper.disabledAt && (
                  <div>
                    <dt>{t('developers.disabledAt')}</dt>
                    <dd>{formatDate(selectedDeveloper.disabledAt, locale)}</dd>
                  </div>
              )}
            </dl>

            {actionError && <div className="status-badge error">{actionError}</div>}
          </div>
        </aside>
      </>
    )
  }

  if (error) {
    return (
      <section className="operator-content operator-section card">
        <div className="status-badge error">{error}</div>
      </section>
    )
  }

  return (
    <div className={`operator-apps-panel${selectedDeveloper ? ' has-drawer' : ''}`}>
      {prerequisitesReady && !prerequisitesDismissed && (
        <DocCallout
          variant="info"
          title={t('developers.prerequisitesTitle')}
          dismissLabel={t('developers.dismissPrerequisites')}
          onDismiss={dismissPrerequisites}
        >
          <p>
            {t.rich('developers.prerequisitesP1', {
              ...withDocRich(),
              developerLink: (chunks) => <Link href="/developer">{chunks}</Link>,
            })}
          </p>
        </DocCallout>
      )}

      <div className="operator-list-toolbar">
        <div className="form-field operator-search-field">
          <label htmlFor="operator-developers-search">{t('searchLabel')}</label>
          <input
            id="operator-developers-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('developers.searchPlaceholder')}
          />
        </div>

        <div className="operator-action-filters" role="group" aria-label={t('developers.filterByStatus')}>
          {DEVELOPER_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className="operator-action-filter"
              data-active={filter === value ? 'true' : 'false'}
              onClick={() => {
                setFilter(value)
                onPageChange(0)
              }}
            >
              {filterLabel(value)}
            </button>
          ))}
        </div>
      </div>

      <section className="operator-content operator-section card operator-apps-list">
        {detailError && <div className="status-badge error">{detailError}</div>}
        {renderListBody(
          developers && developers.items.length > 0 ? (
            <div className="operator-table-wrap">
              <table className="operator-table operator-table--developers">
                <thead>
                  <tr>
                    <th>{t('developers.email')}</th>
                    <th className="operator-table-col-status">{t('columns.status')}</th>
                    <th className="operator-table-col-numeric">{t('developers.apps')}</th>
                    <th className="operator-table-col-date">{t('columns.created')}</th>
                    <th className="operator-table-col-actions">{t('columns.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {developers.items.map((row) => (
                    <tr
                      key={row.id}
                      className="operator-table-row-clickable"
                      data-selected={selectedId === row.id ? 'true' : 'false'}
                      onClick={() => selectDeveloper(row.id)}
                    >
                      <td className="operator-developers-cell-email">{row.email}</td>
                      <td className="operator-table-col-status">
                        <span className={accountStatusPillClass(row)}>
                          {accountStatusLabel(row, t)}
                        </span>
                      </td>
                      <td
                        className="operator-table-col-numeric"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {onNavigateToApps && row.appCount > 0 ? (
                          <button
                            type="button"
                            className="operator-table-nav-link"
                            onClick={() => onNavigateToApps(row.id, row.email)}
                            title={t('viewApps')}
                          >
                            {row.appCount}
                          </button>
                        ) : (
                          row.appCount
                        )}
                      </td>
                      <td className="operator-table-col-date">
                        {formatDate(row.createdAt, locale)}
                      </td>
                      <td
                        className="operator-table-col-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="operator-table-col-actions-inner">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              setLimitsTarget({
                                scope: 'developers',
                                scopeId: row.id,
                                title: row.email,
                              })
                            }
                          >
                            {t('limits.openButton')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="operator-empty">{t('noResults')}</p>
          ),
          developers?.total ?? 0,
        )}
      </section>

      {renderDetailDrawer()}

      <OperatorLimitsModal
        target={limitsTarget}
        onClose={() => setLimitsTarget(null)}
        onUnauthorized={onUnauthorized}
      />
    </div>
  )
}
