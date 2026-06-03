'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { OperatorSpinner } from '@/components/operator-spinner'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'

export interface OperatorRateLimitDetailTarget {
  action: string
  actionLabel: string
  namespaceId: string | null
  appId: string | null
  appName: string | null
  periodStart: string
  periodEnd: string
  count: number
}

interface RateLimitDetailRow {
  clientDeviceId: string | null
  deviceLabel: string | null
  clientIp: string | null
  count: number
}

function RateLimitDeviceCell({
  deviceLabel,
  clientDeviceId,
}: {
  deviceLabel: string | null
  clientDeviceId: string | null
}) {
  const idRef = useRef<HTMLElement>(null)
  const [labelMaxWidth, setLabelMaxWidth] = useState<number | undefined>()

  useEffect(() => {
    const idEl = idRef.current
    if (!idEl || !deviceLabel || !clientDeviceId) {
      setLabelMaxWidth(undefined)
      return
    }

    const syncWidth = () => {
      setLabelMaxWidth(idEl.offsetWidth)
    }

    syncWidth()

    const observer = new ResizeObserver(syncWidth)
    observer.observe(idEl)

    return () => observer.disconnect()
  }, [clientDeviceId, deviceLabel])

  if (!clientDeviceId && !deviceLabel) {
    return <>—</>
  }

  if (!deviceLabel || !clientDeviceId) {
    const primary = deviceLabel ?? clientDeviceId
    return (
      <span className="operator-rate-limit-device-label" title={primary ?? undefined}>
        {primary}
      </span>
    )
  }

  return (
    <div className="operator-rate-limit-device-cell-inner">
      <span
        className="operator-rate-limit-device-label"
        title={deviceLabel}
        style={labelMaxWidth ? { maxWidth: labelMaxWidth } : undefined}
      >
        {deviceLabel}
      </span>
      <code ref={idRef} className="operator-rate-limit-device-id">
        {clientDeviceId}
      </code>
    </div>
  )
}

interface OperatorRateLimitDetailModalProps {
  target: OperatorRateLimitDetailTarget | null
  apiBase?: string
  onClose: () => void
  onUnauthorized: () => void
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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

export function OperatorRateLimitDetailModal({
  target,
  apiBase = '/api/operator',
  onClose,
  onUnauthorized,
}: OperatorRateLimitDetailModalProps) {
  const t = useTranslations('operator.rateLimitUsage')
  const locale = useLocale()
  const [rows, setRows] = useState<RateLimitDetailRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  usePageScrollLock(Boolean(target), 'operator-rate-limit-detail-modal')

  useEffect(() => {
    if (!target) {
      setRows(null)
      setError(null)
      return
    }

    const controller = new AbortController()

    void (async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          action: target.action,
          periodStart: target.periodStart,
        })

        if (target.namespaceId) {
          params.set('namespaceId', target.namespaceId)
        }

        if (target.appId) {
          params.set('appId', target.appId)
        }

        const response = await fetch(`${apiBase}/rate-limit-usage/details?${params.toString()}`, {
          signal: controller.signal,
        })

        if (response.status === 401) {
          onUnauthorized()
          return
        }

        const body = (await response.json()) as RateLimitDetailRow[] | { error?: { message?: string } }

        if (!response.ok) {
          const errorBody = body as { error?: { message?: string } }
          throw new Error(errorBody.error?.message ?? t('loadFailed'))
        }

        if (!Array.isArray(body)) {
          throw new Error(t('loadFailed'))
        }

        setRows(body)
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') {
          return
        }

        setError(loadError instanceof Error ? loadError.message : t('loadFailed'))
        setRows(null)
      } finally {
        setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [apiBase, onUnauthorized, t, target])

  if (!target || typeof document === 'undefined') {
    return null
  }

  const subtitleParts = [
    formatPeriod(target.periodStart, target.periodEnd, locale),
    target.namespaceId ? target.namespaceId : null,
    target.appName ?? target.appId,
  ].filter(Boolean)

  return createPortal(
    <div className="operator-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="operator-modal operator-modal--rate-limit-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operator-rate-limit-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="operator-modal-header">
          <div>
            <h3 id="operator-rate-limit-detail-title">{target.actionLabel}</h3>
            <p className="operator-muted">{subtitleParts.join(' · ')}</p>
            <p className="operator-muted">{t('detailHint', { count: target.count })}</p>
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
          {loading ? (
            <OperatorSpinner label={t('loading')} />
          ) : error ? (
            <p className="operator-error">{error}</p>
          ) : rows && rows.length === 0 ? (
            <p className="operator-empty">{t('noResults')}</p>
          ) : rows ? (
            <div className="operator-table-wrap">
              <table className="operator-table operator-table--rate-limits">
                <thead>
                  <tr>
                    <th>{t('columns.device')}</th>
                    <th>{t('columns.ip')}</th>
                    <th className="operator-table-col-numeric">{t('columns.count')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.clientDeviceId ?? ''}:${row.clientIp ?? ''}`}>
                      <td className="operator-rate-limit-device-cell">
                        <RateLimitDeviceCell
                          deviceLabel={row.deviceLabel}
                          clientDeviceId={row.clientDeviceId}
                        />
                      </td>
                      <td>{row.clientIp ?? '—'}</td>
                      <td className="operator-table-col-numeric">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.some((row) => !row.clientDeviceId && !row.deviceLabel) ? (
                <p className="operator-muted operator-rate-limit-missing-device-hint">{t('missingDeviceHint')}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
