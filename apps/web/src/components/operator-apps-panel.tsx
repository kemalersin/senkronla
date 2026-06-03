'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { OperatorCopyField } from '@/components/operator-copy-field'
import { OperatorCopyButton } from '@/components/operator-copy-button'
import {
  OperatorLimitsModal,
  type OperatorLimitsTarget,
} from '@/components/operator-limits-modal'
import {
  OperatorRevisionPurgeModal,
  type OperatorRevisionPurgeTarget,
} from '@/components/operator-revision-purge-modal'
import {
  OperatorOriginVerifyError,
  type OriginVerifyErrorState,
} from '@/components/operator-origin-verify-error'
import { OperatorScopedDangerPanel } from '@/components/operator-scoped-danger-panel'
import { OperatorSegmentedField } from '@/components/operator-segmented-field'
import { OperatorSpinner } from '@/components/operator-spinner'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'
import { isValidAppId, normalizeAppId } from '@/lib/app-id'
import { dedupedGet, fetchJson } from '@/lib/deduped-fetch'
import { type NativePlatform } from '@/lib/native-platform'
import { withDocRich } from '@/lib/doc-rich-text'

interface Paginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

interface OriginVerification {
  dnsHost: string
  dnsTxt: string
  wellKnownUrl: string
}

interface AppOriginRow {
  id: string
  origin: string
  verifiedAt: string | null
  createdAt: string
  verification?: OriginVerification | null
}

interface AppBundleRow {
  id: string
  platform: NativePlatform
  bundleId: string
  verifiedAt: string | null
  createdAt: string
}

interface AppSummaryRow {
  appId: string
  name: string
  type: 'web' | 'native'
  status: string
  originCount: number
  bundleCount: number
  namespaceCount: number
  developerEmail?: string | null
  createdAt: string
  updatedAt: string
}

interface AppDetail extends AppSummaryRow {
  origins: AppOriginRow[]
  bundles: AppBundleRow[]
  hasClientSecret: boolean
}

interface ApiErrorBody {
  error?: {
    message?: string
    code?: string
    details?: {
      origin?: string
      instructions?: OriginVerification
      fields?: Array<{ path: string; message: string }>
    }
  }
}

function formatApiError(body: ApiErrorBody, fallback: string): string {
  const fields = body.error?.details?.fields
  if (fields?.length) {
    return fields.map((field) => `${field.path}: ${field.message}`).join(' · ')
  }

  return body.error?.message ?? fallback
}

function parseVerifyError(
  body: ApiErrorBody,
  t: ReturnType<typeof useTranslations<'operator'>>,
): OriginVerifyErrorState {
  if (body.error?.code === 'APP_ORIGIN_VERIFICATION_FAILED') {
    const origin = body.error.details?.origin
    const instructions = body.error.details?.instructions

    if (origin && instructions) {
      return {
        kind: 'verification',
        origin,
        dnsHost: instructions.dnsHost,
        wellKnownUrl: instructions.wellKnownUrl,
      }
    }
  }

  return { kind: 'generic', message: body.error?.message ?? t('apps.verifyFailed') }
}

const PAGE_SIZE = 20

const APP_STATUS_FILTERS = [
  '',
  'active',
  'pending_verification',
  'pending',
  'suspended',
  'archived',
] as const

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

function appStatusLabel(
  status: string,
  t: ReturnType<typeof useTranslations<'operator'>>,
  type?: AppSummaryRow['type'],
) {
  switch (status) {
    case 'active':
      return t('apps.statusActive')
    case 'pending_verification':
      return type === 'native'
        ? t('apps.statusPendingApproval')
        : t('apps.statusPendingVerification')
    case 'pending':
      return t('apps.statusPending')
    case 'suspended':
      return t('apps.statusSuspended')
    case 'archived':
      return t('apps.statusArchived')
    default:
      return status
  }
}

function appStatusFilterLabel(
  status: (typeof APP_STATUS_FILTERS)[number],
  t: ReturnType<typeof useTranslations<'operator'>>,
) {
  switch (status) {
    case '':
      return t('apps.filterAll')
    case 'active':
      return t('apps.filterActive')
    case 'pending_verification':
      return t('apps.filterPendingVerification')
    case 'pending':
      return t('apps.filterPending')
    case 'suspended':
      return t('apps.filterSuspended')
    case 'archived':
      return t('apps.filterArchived')
    default:
      return status
  }
}

function statusPillClass(status: string) {
  if (status === 'active') return 'operator-pill operator-pill-ok'
  if (status === 'suspended') return 'operator-pill operator-pill-warn'
  if (status === 'archived') return 'operator-pill operator-pill-muted'
  return 'operator-pill'
}

interface OperatorAppsPanelProps {
  authState: 'loading' | 'guest' | 'authenticated'
  page: number
  mode?: 'operator' | 'developer'
  nativeRequireClientSecret?: boolean
  developerIdFilter?: string | null
  developerFilterLabel?: string | null
  listRefreshKey?: number
  onClearDeveloperFilter?: () => void
  onNavigateToNamespaces?: (appId: string, label: string) => void
  onUnauthorized: () => void
  onPageChange: (page: number) => void
}

export function OperatorAppsPanel({
  authState,
  page,
  mode = 'operator',
  nativeRequireClientSecret = false,
  developerIdFilter = null,
  developerFilterLabel = null,
  listRefreshKey = 0,
  onClearDeveloperFilter,
  onNavigateToNamespaces,
  onUnauthorized,
  onPageChange,
}: OperatorAppsPanelProps) {
  const t = useTranslations('operator')
  const locale = useLocale()
  const apiBase = mode === 'developer' ? '/api/developer' : '/api/operator'

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [apps, setApps] = useState<Paginated<AppSummaryRow> | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [selectedApp, setSelectedApp] = useState<AppDetail | null>(null)
  const [drawerTab, setDrawerTab] = useState<'detail' | 'danger'>('detail')
  const [detailError, setDetailError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const [createAppId, setCreateAppId] = useState('')
  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState<'web' | 'native'>('web')
  const [createOrigin, setCreateOrigin] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [addOrigin, setAddOrigin] = useState('')
  const [addBundlePlatform, setAddBundlePlatform] = useState<NativePlatform>('ios')
  const [addBundleId, setAddBundleId] = useState('')
  const [revealedClientSecret, setRevealedClientSecret] = useState<string | null>(null)
  const [verifyingOriginId, setVerifyingOriginId] = useState<string | null>(null)
  const [originVerifyErrors, setOriginVerifyErrors] = useState<Record<string, OriginVerifyErrorState>>({})
  const [limitsTarget, setLimitsTarget] = useState<OperatorLimitsTarget | null>(null)
  const [revisionPurgeTarget, setRevisionPurgeTarget] = useState<OperatorRevisionPurgeTarget | null>(null)
  const loadAppsRequestId = useRef(0)
  const tRef = useRef(t)
  tRef.current = t
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized
  const listQueryRef = useRef({
    apiBase,
    debouncedSearch,
    developerIdFilter,
    mode,
    page,
    statusFilter,
  })
  listQueryRef.current = {
    apiBase,
    debouncedSearch,
    developerIdFilter,
    mode,
    page,
    statusFilter,
  }

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

  const loadApps = useCallback(async (options?: { dedupe?: boolean }) => {
    const requestId = ++loadAppsRequestId.current
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

      if (query.statusFilter) {
        params.set('status', query.statusFilter)
      }

      if (query.mode === 'operator' && query.developerIdFilter) {
        params.set('developerId', query.developerIdFilter)
      }

      const url = `${query.apiBase}/apps?${params.toString()}`
      const { response, body: rawBody } = options?.dedupe
        ? await dedupedGet(url)
        : await fetchJson(url)
      const body = rawBody as Paginated<AppSummaryRow> & ApiErrorBody

      if (requestId !== loadAppsRequestId.current) {
        return
      }

      if (response.status === 401) {
        onUnauthorizedRef.current()
        return
      }

      if (requestId !== loadAppsRequestId.current) {
        return
      }

      if (!response.ok) {
        throw new Error(body.error?.message ?? tRef.current('loadFailed'))
      }

      setApps(body)
    } catch (loadError) {
      if (requestId !== loadAppsRequestId.current) {
        return
      }

      setError(loadError instanceof Error ? loadError.message : tRef.current('loadFailed'))
    } finally {
      if (requestId === loadAppsRequestId.current) {
        setLoading(false)
      }
    }
  }, [])

  const loadAppDetail = useCallback(
    async (appId: string) => {
      setDetailError(null)
      setActionError(null)

      try {
        const response = await fetch(`${apiBase}/apps/${encodeURIComponent(appId)}`)

        if (response.status === 401) {
          onUnauthorized()
          return
        }

        const body = await readJson<AppDetail>(response)

        if (!response.ok) {
          throw new Error(body.error?.message ?? t('loadFailed'))
        }

        setSelectedApp(body)
      } catch (loadError) {
        setSelectedAppId(null)
        setSelectedApp(null)
        setDetailError(loadError instanceof Error ? loadError.message : t('loadFailed'))
      }
    },
    [apiBase, onUnauthorized, t],
  )

  function selectApp(appId: string) {
    if (showCreate) {
      closeCreateDrawer()
    }

    if (selectedApp?.appId === appId) {
      closeDetailPanel()
      return
    }

    setSelectedAppId(appId)
    setSelectedApp(null)
    setDetailError(null)
    setActionError(null)
    setRevealedClientSecret(null)
  }

  useEffect(() => {
    if (authState !== 'authenticated') {
      return
    }

    void loadApps({ dedupe: true })
  }, [authState, apiBase, debouncedSearch, developerIdFilter, loadApps, mode, page, statusFilter])

  useEffect(() => {
    if (authState !== 'authenticated' || listRefreshKey === 0) {
      return
    }

    setApps(null)
    setSelectedAppId(null)
    setSelectedApp(null)
    setDetailError(null)
    setActionError(null)
    setRevealedClientSecret(null)
    void loadApps()
  }, [authState, listRefreshKey, loadApps])

  useEffect(() => {
    if (!selectedAppId || selectedApp?.appId === selectedAppId) {
      return
    }

    void loadAppDetail(selectedAppId)
  }, [loadAppDetail, selectedApp?.appId, selectedAppId])

  async function handleCreateApp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateLoading(true)
    setCreateError(null)

    const normalizedAppId = normalizeAppId(createAppId)

    if (mode === 'operator' && !isValidAppId(normalizedAppId)) {
      setCreateError(t('apps.appIdInvalid'))
      setCreateLoading(false)
      return
    }

    try {
      const response = await fetch(`${apiBase}/apps`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          mode === 'developer'
            ? {
                name: createName.trim(),
                type: createType,
              }
            : {
                appId: normalizedAppId,
                name: createName.trim(),
                type: createType,
                status: 'active',
                ...(createType === 'web' && createOrigin.trim()
                  ? { origins: [createOrigin.trim()] }
                  : {}),
              },
        ),
      })

      const body = await readJson<AppDetail>(response)

      if (!response.ok) {
        setCreateError(formatApiError(body, t('requestFailed')))
        return
      }

      setCreateAppId('')
      setCreateName('')
      setCreateOrigin('')
      closeCreateDrawer()
      setSelectedAppId(body.appId)
      setSelectedApp(body)
      await loadApps()
    } catch {
      setCreateError(t('requestFailed'))
    } finally {
      setCreateLoading(false)
    }
  }

  async function patchAppStatus(status: string) {
    if (!selectedAppId) return

    setActionLoading(true)
    setActionError(null)

    try {
      const response = await fetch(`${apiBase}/apps/${encodeURIComponent(selectedAppId)}`, {
        method: mode === 'developer' ? 'DELETE' : 'PATCH',
        headers: mode === 'developer' ? undefined : { 'content-type': 'application/json' },
        ...(mode === 'developer'
          ? {}
          : {
              body: JSON.stringify({ status }),
            }),
      })

      const body = await readJson<AppDetail>(response)

      if (!response.ok) {
        setActionError(body.error?.message ?? t('requestFailed'))
        return
      }

      setSelectedApp(body)
      await loadApps()
    } catch {
      setActionError(t('requestFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleAddOrigin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAppId || !addOrigin.trim() || selectedApp?.status === 'archived') return

    setActionLoading(true)
    setActionError(null)

    try {
      const response = await fetch(
        `${apiBase}/apps/${encodeURIComponent(selectedAppId)}/origins`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ origin: addOrigin.trim() }),
        },
      )

      const body = await readJson<AppDetail>(response)

      if (!response.ok) {
        setActionError(body.error?.message ?? t('requestFailed'))
        return
      }

      setAddOrigin('')
      setSelectedApp(body)
      await loadApps()
    } catch {
      setActionError(t('requestFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleVerifyOrigin(originId: string) {
    if (!selectedAppId) return

    setVerifyingOriginId(originId)
    setOriginVerifyErrors((current) => {
      const next = { ...current }
      delete next[originId]
      return next
    })

    try {
      const response = await fetch(
        `${apiBase}/apps/${encodeURIComponent(selectedAppId)}/origins/${encodeURIComponent(originId)}/verify`,
        { method: 'POST' },
      )

      const body = await readJson<{ app: AppDetail; verification?: { method: string } }>(response)

      if (!response.ok) {
        setOriginVerifyErrors((current) => ({
          ...current,
          [originId]: parseVerifyError(body, t),
        }))
        return
      }

      setSelectedApp(body.app)
      await loadApps()
    } catch {
      setOriginVerifyErrors((current) => ({
        ...current,
        [originId]: { kind: 'generic', message: t('apps.verifyFailed') },
      }))
    } finally {
      setVerifyingOriginId(null)
    }
  }

  async function handleDeleteOrigin(originId: string) {
    if (!selectedAppId || selectedApp?.status === 'archived') return

    setActionLoading(true)
    setActionError(null)

    try {
      const response = await fetch(
        `${apiBase}/apps/${encodeURIComponent(selectedAppId)}/origins/${encodeURIComponent(originId)}`,
        { method: 'DELETE' },
      )

      const body = await readJson<AppDetail>(response)

      if (!response.ok) {
        setActionError(body.error?.message ?? t('requestFailed'))
        return
      }

      setOriginVerifyErrors((current) => {
        const next = { ...current }
        delete next[originId]
        return next
      })
      setSelectedApp(body)
      await loadApps()
    } catch {
      setActionError(t('requestFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleAddBundle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAppId || !addBundleId.trim()) return

    setActionLoading(true)
    setActionError(null)

    try {
      const response = await fetch(
        `${apiBase}/apps/${encodeURIComponent(selectedAppId)}/bundles`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            platform: addBundlePlatform,
            bundleId: addBundleId.trim(),
          }),
        },
      )

      const body = await readJson<AppDetail>(response)

      if (!response.ok) {
        setActionError(body.error?.message ?? t('requestFailed'))
        return
      }

      setAddBundleId('')
      setSelectedApp(body)
      await loadApps()
    } catch {
      setActionError(t('requestFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRotateSecret() {
    if (!selectedAppId || mode !== 'developer') return

    if (
      (selectedApp?.hasClientSecret || revealedClientSecret) &&
      !window.confirm(t('apps.rotateSecretConfirm'))
    ) {
      return
    }

    setActionLoading(true)
    setActionError(null)

    try {
      const response = await fetch(
        `${apiBase}/apps/${encodeURIComponent(selectedAppId)}/rotate-secret`,
        { method: 'POST' },
      )

      const body = await readJson<{ clientSecret?: string; app?: AppDetail }>(response)

      if (!response.ok) {
        setActionError(body.error?.message ?? t('requestFailed'))
        return
      }

      if (body.clientSecret) {
        setRevealedClientSecret(body.clientSecret)
      }

      if (body.app) {
        setSelectedApp(body.app)
      }

      await loadApps()
    } catch {
      setActionError(t('requestFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleApproveBundle(bundleId: string) {
    if (!selectedAppId) return

    setActionLoading(true)
    setActionError(null)

    try {
      const response = await fetch(
        `${apiBase}/apps/${encodeURIComponent(selectedAppId)}/bundles/${encodeURIComponent(bundleId)}/approve`,
        { method: 'POST' },
      )

      const body = await readJson<AppDetail>(response)

      if (!response.ok) {
        setActionError(body.error?.message ?? t('requestFailed'))
        return
      }

      setSelectedApp(body)
      await loadApps()
    } catch {
      setActionError(t('requestFailed'))
    } finally {
      setActionLoading(false)
    }
  }

  function renderListBody(content: ReactNode, total: number) {
    if (!apps && loading) {
      return <OperatorSpinner label={t('loading')} />
    }

    if (!apps) {
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

  function closeCreateDrawer() {
    setShowCreate(false)
    setCreateError(null)
  }

  function openCreateDrawer() {
    closeDetailPanel()
    setCreateError(null)
    setShowCreate(true)
  }

  function closeDetailPanel() {
    setSelectedAppId(null)
    setSelectedApp(null)
    setDrawerTab('detail')
    setActionError(null)
    setDetailError(null)
    setVerifyingOriginId(null)
    setOriginVerifyErrors({})
    setRevealedClientSecret(null)
  }

  function handleAppDeleted() {
    closeDetailPanel()
    setApps(null)
    void loadApps()
    onPageChange(0)
  }

  const drawerOpen = showCreate || Boolean(selectedApp)

  usePageScrollLock(drawerOpen, 'operator-apps-drawer')

  useEffect(() => {
    if (!drawerOpen) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (showCreate) {
          closeCreateDrawer()
        } else {
          closeDetailPanel()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [drawerOpen, showCreate])

  function renderCreateDrawer() {
    if (!showCreate) {
      return null
    }

    return (
      <>
        <button
          type="button"
          className="operator-apps-drawer-backdrop"
          aria-label={t('apps.closeDetail')}
          onClick={closeCreateDrawer}
        />
        <aside
          className="operator-apps-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="operator-apps-create-drawer-title"
        >
          <header className="operator-apps-drawer-header">
            <div className="operator-apps-drawer-heading">
              <h3 id="operator-apps-create-drawer-title">{t('apps.createTitle')}</h3>
              <p className="operator-muted">{t('apps.createHint')}</p>
            </div>
            <button
              type="button"
              className="operator-apps-drawer-close"
              aria-label={t('apps.closeDetail')}
              onClick={closeCreateDrawer}
            >
              ×
            </button>
          </header>

          <div className="operator-apps-drawer-body">
            <form className="operator-apps-drawer-form" onSubmit={handleCreateApp}>
              {mode === 'operator' && (
                <div className="form-field">
                  <label htmlFor="create-app-id">{t('apps.appId')}</label>
                  <input
                    id="create-app-id"
                    value={createAppId}
                    onChange={(event) => setCreateAppId(event.target.value)}
                    placeholder="esr_app_my_app"
                    autoComplete="off"
                    spellCheck={false}
                    pattern="esr_app_[a-z0-9_]+"
                    required
                  />
                  <p className="form-field-hint">{t('apps.appIdHint')}</p>
                </div>
              )}
              <div className="form-field">
                <label htmlFor="create-app-name">{t('apps.name')}</label>
                <input
                  id="create-app-name"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  required
                />
              </div>
              <OperatorSegmentedField
                label={t('apps.type')}
                value={createType}
                compact
                options={[
                  { value: 'web', label: t('apps.typeWeb') },
                  { value: 'native', label: t('apps.typeNative') },
                ]}
                onChange={setCreateType}
              />
              {mode === 'operator' && createType === 'web' && (
                <div className="form-field">
                  <label htmlFor="create-app-origin">{t('apps.initialOrigin')}</label>
                  <input
                    id="create-app-origin"
                    type="url"
                    value={createOrigin}
                    onChange={(event) => setCreateOrigin(event.target.value)}
                    placeholder="https://app.example.com"
                  />
                </div>
              )}
              <div className="operator-apps-drawer-form-actions">
                <button type="submit" className="btn btn-primary" disabled={createLoading}>
                  {createLoading ? t('apps.creating') : t('apps.create')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={createLoading}
                  onClick={closeCreateDrawer}
                >
                  {t('apps.cancelCreate')}
                </button>
              </div>
            </form>

            {createError && <div className="status-badge error">{createError}</div>}
          </div>
        </aside>
      </>
    )
  }

  function renderDetailDrawer() {
    if (!selectedApp) {
      return null
    }

    const showNativeClientSecret =
      mode === 'developer' &&
      nativeRequireClientSecret &&
      selectedApp.type === 'native' &&
      selectedApp.status === 'active' &&
      selectedApp.bundles.length > 0 &&
      selectedApp.bundles.every((bundle) => bundle.verifiedAt)

    return (
      <>
        <button
          type="button"
          className="operator-apps-drawer-backdrop"
          aria-label={t('apps.closeDetail')}
          onClick={closeDetailPanel}
        />
        <aside
          className="operator-apps-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="operator-apps-drawer-title"
        >
          <header className="operator-apps-drawer-header">
            <div className="operator-apps-drawer-heading">
              <p className="operator-apps-drawer-id">
                <code>{selectedApp.appId}</code>
                <OperatorCopyButton value={selectedApp.appId} />
              </p>
              <h3 id="operator-apps-drawer-title">{selectedApp.name}</h3>
              <div className="operator-apps-drawer-badges">
                <span className={statusPillClass(selectedApp.status)}>
                  {appStatusLabel(selectedApp.status, t, selectedApp.type)}
                </span>
                <span className="operator-pill">
                  {selectedApp.type === 'web' ? t('apps.typeWeb') : t('apps.typeNative')}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="operator-apps-drawer-close"
              aria-label={t('apps.closeDetail')}
              onClick={closeDetailPanel}
            >
              ×
            </button>
          </header>

          {mode === 'operator' && (
            <nav className="operator-settings-tabs" aria-label={t('settingsTabs.danger')}>
              <button
                type="button"
                role="tab"
                className="operator-tab"
                data-active={drawerTab === 'detail' ? 'true' : 'false'}
                aria-selected={drawerTab === 'detail'}
                onClick={() => setDrawerTab('detail')}
              >
                {t('drawerTabs.detail')}
              </button>
              <button
                type="button"
                role="tab"
                className="operator-tab"
                data-active={drawerTab === 'danger' ? 'true' : 'false'}
                aria-selected={drawerTab === 'danger'}
                onClick={() => setDrawerTab('danger')}
              >
                {t('settingsTabs.danger')}
              </button>
            </nav>
          )}

          {drawerTab === 'detail' &&
          ((mode === 'operator' && selectedApp.status === 'active') ||
          (mode === 'operator' && selectedApp.status === 'suspended') ||
          selectedApp.status !== 'archived') ? (
            <div className="operator-apps-drawer-toolbar">
              {mode === 'operator' && selectedApp.status === 'active' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={actionLoading}
                  onClick={() => void patchAppStatus('suspended')}
                >
                  {t('apps.suspend')}
                </button>
              )}
              {mode === 'operator' && selectedApp.status === 'suspended' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={actionLoading}
                  onClick={() => void patchAppStatus('active')}
                >
                  {t('apps.activate')}
                </button>
              )}
              {selectedApp.status !== 'archived' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={actionLoading}
                  onClick={() => void patchAppStatus('archived')}
                >
                  {t('apps.archive')}
                </button>
              )}
            </div>
          ) : null}

          <div className="operator-apps-drawer-body">
            {drawerTab === 'danger' && mode === 'operator' ? (
              <OperatorScopedDangerPanel
                scope="app"
                scopeId={selectedApp.appId}
                onDeleted={handleAppDeleted}
                onUnauthorized={onUnauthorized}
              />
            ) : (
            <>
              {selectedApp.type === 'web' && (
                  <div className="operator-apps-subsection">
                    <h4>{t('apps.origins')}</h4>
                    {selectedApp.origins.length === 0 ? (
                      <p className="operator-muted">{t('apps.noOrigins')}</p>
                    ) : (
                      <ul className="operator-apps-origin-list">
                        {selectedApp.origins.map((origin) => {
                          const verifyError = originVerifyErrors[origin.id]

                          return (
                          <li key={origin.id}>
                            <div className="operator-apps-origin-row">
                              <code className="operator-apps-origin-url">{origin.origin}</code>
                              <div className="operator-apps-origin-actions">
                                <span
                                  className={
                                    origin.verifiedAt ? 'operator-pill operator-pill-ok' : 'operator-pill'
                                  }
                                >
                                  {origin.verifiedAt ? t('apps.verified') : t('apps.unverified')}
                                </span>
                                {!origin.verifiedAt && (
                                  verifyingOriginId === origin.id ? (
                                    <span
                                      className="operator-inline-spinner"
                                      aria-busy="true"
                                      aria-live="polite"
                                    >
                                      <span
                                        className="operator-spinner"
                                        aria-label={t('apps.verifying')}
                                        role="status"
                                      />
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      disabled={Boolean(verifyingOriginId) || actionLoading}
                                      onClick={() => void handleVerifyOrigin(origin.id)}
                                    >
                                      {t('apps.verify')}
                                    </button>
                                  )
                                )}
                                {selectedApp.status !== 'archived' && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={Boolean(verifyingOriginId) || actionLoading}
                                    onClick={() => void handleDeleteOrigin(origin.id)}
                                  >
                                    {t('apps.removeOrigin')}
                                  </button>
                                )}
                              </div>
                            </div>
                            {origin.verification && (
                              <div className="operator-apps-verification">
                                <OperatorCopyField
                                  label={t('apps.dnsRecord')}
                                  value={origin.verification.dnsHost}
                                />
                                <OperatorCopyField
                                  label={t('apps.dnsTxt')}
                                  value={origin.verification.dnsTxt}
                                />
                                <OperatorCopyField
                                  label={t('apps.wellKnown')}
                                  value={origin.verification.wellKnownUrl}
                                />
                              </div>
                            )}
                            {verifyError ? (
                              <OperatorOriginVerifyError error={verifyError} />
                            ) : null}
                          </li>
                          )
                        })}
                      </ul>
                    )}

                    {selectedApp.status !== 'archived' && (
                      <form className="operator-apps-drawer-form" onSubmit={handleAddOrigin}>
                        <div className="form-field">
                          <label htmlFor="add-origin">{t('apps.addOrigin')}</label>
                          <input
                            id="add-origin"
                            type="url"
                            value={addOrigin}
                            onChange={(event) => setAddOrigin(event.target.value)}
                            placeholder="https://app.example.com"
                            required
                          />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                          {t('apps.addOriginButton')}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {selectedApp.type === 'native' && (
                  <>
                    <div className="operator-apps-subsection">
                      <h4>{t('apps.bundles')}</h4>
                      {selectedApp.bundles.length === 0 ? (
                        <p className="operator-muted">{t('apps.noBundles')}</p>
                      ) : (
                        <ul className="operator-apps-bundle-list">
                          {selectedApp.bundles.map((bundle) => (
                            <li key={bundle.id} className="operator-apps-bundle-row">
                              <code>{bundle.platform}: {bundle.bundleId}</code>
                              <span className={bundle.verifiedAt ? 'operator-pill operator-pill-ok' : 'operator-pill'}>
                                {bundle.verifiedAt
                                  ? t('apps.bundleApproved')
                                  : t('apps.bundlePendingApproval')}
                              </span>
                              {!bundle.verifiedAt && mode === 'operator' && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={actionLoading}
                                  onClick={() => void handleApproveBundle(bundle.id)}
                                >
                                  {t('apps.approve')}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      <form className="operator-apps-drawer-form" onSubmit={handleAddBundle}>
                        <OperatorSegmentedField
                          label={t('apps.platform')}
                          value={addBundlePlatform}
                          compact
                          options={[
                            { value: 'ios', label: t('apps.platformIos') },
                            { value: 'android', label: t('apps.platformAndroid') },
                            { value: 'desktop', label: t('apps.platformDesktop') },
                          ]}
                          onChange={setAddBundlePlatform}
                        />
                        <div className="form-field">
                          <label htmlFor="add-bundle-id">{t('apps.bundleId')}</label>
                          <input
                            id="add-bundle-id"
                            value={addBundleId}
                            onChange={(event) => setAddBundleId(event.target.value)}
                            placeholder="com.example.app"
                            required
                          />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                          {t('apps.addBundleButton')}
                        </button>
                      </form>
                    </div>

                    {showNativeClientSecret && (
                      <div className="operator-apps-subsection operator-apps-client-secret">
                        <div className="operator-apps-client-secret-header">
                          <h4>{t('apps.clientSecret')}</h4>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={actionLoading}
                            onClick={() => void handleRotateSecret()}
                          >
                            {selectedApp.hasClientSecret || revealedClientSecret
                              ? t('apps.rotateSecret')
                              : t('apps.generateSecret')}
                          </button>
                        </div>
                        <div className="operator-apps-client-secret-panel">
                          <p className="operator-apps-client-secret-when">{t('apps.clientSecretWhen')}</p>
                          <p className="operator-apps-client-secret-hint">
                            {t.rich('apps.clientSecretHint', withDocRich())}
                          </p>
                          {revealedClientSecret ? (
                            <>
                              <OperatorCopyField
                                label={t('apps.clientSecretValue')}
                                value={revealedClientSecret}
                              />
                              <p className="operator-apps-client-secret-notice" role="note">
                                {t('apps.clientSecretOnce')}
                              </p>
                            </>
                          ) : selectedApp.hasClientSecret ? (
                            <p className="operator-apps-client-secret-status">
                              {t('apps.clientSecretConfigured')}
                            </p>
                          ) : (
                            <p className="operator-apps-client-secret-status">
                              {t('apps.clientSecretNone')}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                  {actionError && <div className="status-badge error">{actionError}</div>}
            </>
            )}
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
    <div className={`operator-apps-panel${drawerOpen ? ' has-drawer' : ''}`}>
      <div className="operator-list-toolbar">
        <div className="operator-list-toolbar-row">
          <div className="form-field operator-search-field">
            <label htmlFor="operator-apps-search">{t('searchLabel')}</label>
            <input
              id="operator-apps-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('apps.searchPlaceholder')}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary operator-list-toolbar-cta"
            onClick={openCreateDrawer}
          >
            {t('apps.newApp')}
          </button>
        </div>

        <div className="operator-action-filters" role="group" aria-label={t('apps.filterByStatus')}>
          {APP_STATUS_FILTERS.map((status) => (
            <button
              key={status || 'all'}
              type="button"
              className="operator-action-filter"
              data-active={statusFilter === status ? 'true' : 'false'}
              title={status ? appStatusLabel(status, t) : t('apps.filterAllStatuses')}
              onClick={() => {
                setStatusFilter(status)
                onPageChange(0)
              }}
            >
              {appStatusFilterLabel(status, t)}
            </button>
          ))}
        </div>
        {mode === 'operator' && developerIdFilter && developerFilterLabel && onClearDeveloperFilter && (
          <div className="operator-list-filter">
            <span className="operator-muted">
              {t('appsDeveloperFilter', { email: developerFilterLabel })}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClearDeveloperFilter}>
              {t('clearFilter')}
            </button>
          </div>
        )}
      </div>

      <section className="operator-content operator-section card operator-apps-list">
        {detailError && <div className="status-badge error">{detailError}</div>}
        {renderListBody(
          apps && apps.items.length > 0 ? (
            <div className="operator-table-wrap">
              <table className="operator-table operator-table--apps">
                <thead>
                  <tr>
                    <th className="operator-table-col-sticky">{t('apps.listApp')}</th>
                    <th>{t('apps.type')}</th>
                    <th className="operator-table-col-status">{t('columns.status')}</th>
                    <th className="operator-table-col-numeric">{t('apps.origins')}</th>
                    <th className="operator-table-col-numeric">{t('apps.namespaces')}</th>
                    <th className="operator-table-col-date">{t('columns.created')}</th>
                    {mode === 'operator' && (
                      <th className="operator-table-col-actions">{t('columns.actions')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {apps.items.map((row) => (
                    <tr
                      key={row.appId}
                      className="operator-table-row-clickable"
                      data-selected={selectedAppId === row.appId ? 'true' : 'false'}
                      onClick={() => selectApp(row.appId)}
                    >
                      <td className="operator-table-col-sticky operator-apps-cell-primary">
                        <div className="operator-apps-cell-primary-layout">
                          <div className="operator-apps-cell-primary-body">
                            <span className="operator-apps-cell-name">{row.name}</span>
                            <code
                              className="operator-apps-cell-id"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {row.appId}
                            </code>
                          </div>
                          <span onClick={(event) => event.stopPropagation()}>
                            <OperatorCopyButton value={row.appId} />
                          </span>
                        </div>
                      </td>
                      <td>{row.type === 'web' ? t('apps.typeWeb') : t('apps.typeNative')}</td>
                      <td className="operator-table-col-status">
                        <span className={statusPillClass(row.status)}>
                          {appStatusLabel(row.status, t, row.type)}
                        </span>
                      </td>
                      <td className="operator-table-col-numeric">{row.originCount}</td>
                      <td
                        className="operator-table-col-numeric"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {mode === 'operator' && onNavigateToNamespaces && row.namespaceCount > 0 ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => onNavigateToNamespaces(row.appId, row.name)}
                            title={t('viewNamespaces')}
                          >
                            {row.namespaceCount}
                          </button>
                        ) : (
                          row.namespaceCount
                        )}
                      </td>
                      <td className="operator-table-col-date">{formatDate(row.createdAt, locale)}</td>
                      {mode === 'operator' && (
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
                                  scope: 'apps',
                                  scopeId: row.appId,
                                  title: row.name,
                                  subtitle: row.appId,
                                })
                              }
                            >
                              {t('limits.openButton')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                setRevisionPurgeTarget({
                                  scope: 'app',
                                  scopeId: row.appId,
                                  title: row.name,
                                  subtitle: row.appId,
                                })
                              }
                            >
                              {t('revisions.openButton')}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="operator-empty">{t('noResults')}</p>
          ),
          apps?.total ?? 0,
        )}
      </section>

      {renderCreateDrawer()}
      {renderDetailDrawer()}

      {mode === 'operator' && (
        <>
          <OperatorLimitsModal
            target={limitsTarget}
            apiBase={apiBase}
            onClose={() => setLimitsTarget(null)}
            onUnauthorized={onUnauthorized}
          />
          <OperatorRevisionPurgeModal
            target={revisionPurgeTarget}
            apiBase={apiBase}
            onClose={() => setRevisionPurgeTarget(null)}
            onUnauthorized={onUnauthorized}
          />
        </>
      )}
    </div>
  )
}
