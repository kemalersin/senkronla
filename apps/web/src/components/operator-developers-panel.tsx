'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { OperatorSpinner } from '@/components/operator-spinner'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'

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

const DEVELOPER_FILTERS = ['all', 'verified', 'unverified', 'disabled'] as const
type DeveloperFilter = (typeof DEVELOPER_FILTERS)[number]

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale)
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
  onUnauthorized: () => void
  onPageChange: (page: number) => void
}

export function OperatorDevelopersPanel({
  authState,
  page,
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
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (authState !== 'authenticated') {
      return
    }

    onPageChange(0)
  }, [authState, debouncedSearch, filter, onPageChange])

  const loadDevelopers = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      })

      if (debouncedSearch) {
        params.set('q', debouncedSearch)
      }

      if (filter !== 'all') {
        params.set('filter', filter)
      }

      const response = await fetch(`/api/operator/developers?${params.toString()}`)

      if (response.status === 401) {
        onUnauthorized()
        return
      }

      const body = await readJson<Paginated<DeveloperRow>>(response)

      if (!response.ok) {
        throw new Error(body.error?.message ?? t('loadFailed'))
      }

      setDevelopers(body)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, filter, onUnauthorized, page, t])

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

    void loadDevelopers()
  }, [authState, loadDevelopers])

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
    if (loading || !developers) {
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
                      <td className="operator-table-col-numeric">{row.appCount}</td>
                      <td className="operator-table-col-date">
                        {formatDate(row.createdAt, locale)}
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
    </div>
  )
}
