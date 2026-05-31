'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { OperatorSpinner } from '@/components/operator-spinner'
import { dedupedGet, fetchJson } from '@/lib/deduped-fetch'

interface MailSmtpSettings {
  host: string
  port: number
  secure: boolean
  user: string
  passwordConfigured: boolean
}

interface MailSettingsResponse {
  config: {
    enabled: boolean
    from: string
    fromName: string
    webBaseUrl: string
    smtp: MailSmtpSettings
  }
  overrides: Partial<{
    enabled: boolean | null
    from: string | null
    fromName: string | null
    webBaseUrl: string | null
    smtp: Partial<{
      host: string | null
      port: number | null
      secure: boolean | null
      user: string | null
      password: string | null
    }> | null
  }> | null
  effective: {
    enabled: boolean
    from: string
    fromName: string
    webBaseUrl: string
    smtp: MailSmtpSettings
  }
}

interface ApiErrorBody {
  error?: { message?: string }
}

function overrideText(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? '' : value
}

function overrideNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

export function OperatorMailSettingsPanel({
  authState,
  onUnauthorized,
  variant = 'page',
}: {
  authState: 'loading' | 'guest' | 'authenticated'
  onUnauthorized: () => void
  variant?: 'page' | 'drawer'
}) {
  const t = useTranslations('operator.mail')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [settings, setSettings] = useState<MailSettingsResponse | null>(null)
  const loadSettingsRequestId = useRef(0)
  const tRef = useRef(t)
  tRef.current = t
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null)
  const [from, setFrom] = useState('')
  const [fromName, setFromName] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('')
  const [smtpSecureOverride, setSmtpSecureOverride] = useState<boolean | null>(null)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')

  const applySettings = useCallback((data: MailSettingsResponse) => {
    const override = data.overrides ?? {}

    setEnabledOverride(override.enabled ?? null)
    setFrom(overrideText(override.from))
    setFromName(overrideText(override.fromName))
    setSmtpHost(overrideText(override.smtp?.host))
    setSmtpPort(overrideNumber(override.smtp?.port))
    setSmtpSecureOverride(override.smtp?.secure ?? null)
    setSmtpUser(overrideText(override.smtp?.user))
    setSmtpPassword('')
  }, [])

  const loadSettings = useCallback(async (options?: { dedupe?: boolean }) => {
    const requestId = ++loadSettingsRequestId.current
    setLoading(true)
    setError(null)

    try {
      const url = '/api/operator/settings/mail'
      const { response, body: rawBody } = options?.dedupe
        ? await dedupedGet(url)
        : await fetchJson(url)
      const body = rawBody as MailSettingsResponse & ApiErrorBody

      if (requestId !== loadSettingsRequestId.current) {
        return
      }

      if (response.status === 401) {
        onUnauthorizedRef.current()
        return
      }

      if (!response.ok) {
        setError(body.error?.message ?? tRef.current('loadFailed'))
        return
      }

      setSettings(body)
      applySettings(body)
    } catch (loadError) {
      if (requestId !== loadSettingsRequestId.current) {
        return
      }

      setError(tRef.current('loadFailed'))
    } finally {
      if (requestId === loadSettingsRequestId.current) {
        setLoading(false)
      }
    }
  }, [applySettings])

  useEffect(() => {
    if (authState !== 'authenticated') {
      return
    }

    void loadSettings({ dedupe: true })
  }, [authState, loadSettings])

  function parseOptionalText(value: string): string | null {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }

  function handleEnabledToggle(checked: boolean) {
    if (!settings) {
      return
    }

    setEnabledOverride(checked === settings.config.enabled ? null : checked)
  }

  function handleSecureToggle(checked: boolean) {
    if (!settings) {
      return
    }

    setSmtpSecureOverride(checked === settings.config.smtp.secure ? null : checked)
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings) {
      return
    }

    setSaving(true)
    setError(null)
    setSaved(false)

    const portTrimmed = smtpPort.trim()
    const portOverride =
      portTrimmed === '' ? null : Number.isFinite(Number(portTrimmed)) ? Number(portTrimmed) : null

    const patch = {
      enabled: enabledOverride,
      from: parseOptionalText(from),
      fromName: parseOptionalText(fromName),
      smtp: {
        host: parseOptionalText(smtpHost),
        port: portOverride,
        secure: smtpSecureOverride,
        user: parseOptionalText(smtpUser),
        ...(smtpPassword.trim() ? { password: smtpPassword } : {}),
      },
    }

    try {
      const response = await fetch('/api/operator/settings/mail', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })

      const body = (await response.json()) as MailSettingsResponse & ApiErrorBody

      if (response.status === 401) {
        onUnauthorized()
        return
      }

      if (!response.ok) {
        setError(body.error?.message ?? t('saveFailed'))
        return
      }

      setSettings(body)
      applySettings(body)
      setSaved(true)
    } catch {
      setError(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (authState === 'loading' || loading) {
    return variant === 'drawer' ? (
      <OperatorSpinner label={t('loading')} compact />
    ) : (
      <OperatorSpinner label={t('loading')} />
    )
  }

  if (!settings) {
    return error ? <div className="status-badge error">{error}</div> : null
  }

  const displayEnabled = enabledOverride ?? settings.config.enabled
  const displaySecure = smtpSecureOverride ?? settings.config.smtp.secure

  return (
    <section
      className={
        variant === 'drawer'
          ? 'operator-mail-settings operator-mail-settings--drawer'
          : 'operator-content operator-section card operator-mail-settings'
      }
    >
      {variant === 'page' && (
        <header className="operator-mail-settings-header">
          <h2>{t('title')}</h2>
        </header>
      )}

      <form className="operator-mail-form" onSubmit={(event) => void handleSave(event)}>
        <fieldset className="operator-mail-section">
          <legend>{t('sections.general')}</legend>

          <div className="operator-toggle-field">
            <span className="operator-toggle-label">{t('fields.enabled')}</span>
            <label className="operator-toggle">
              <input
                type="checkbox"
                checked={displayEnabled}
                onChange={(event) => handleEnabledToggle(event.target.checked)}
              />
              <span className="operator-toggle-track" aria-hidden="true">
                <span className="operator-toggle-thumb" />
              </span>
              <span className="operator-toggle-text">
                {displayEnabled ? t('statusEnabled') : t('statusDisabled')}
              </span>
            </label>
          </div>

          <div className="form-field">
            <label htmlFor="mail-from">{t('fields.from')}</label>
            <input
              id="mail-from"
              type="email"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder={settings.config.from || '—'}
            />
          </div>

          <div className="form-field">
            <label htmlFor="mail-from-name">{t('fields.fromName')}</label>
            <input
              id="mail-from-name"
              value={fromName}
              onChange={(event) => setFromName(event.target.value)}
              placeholder={settings.config.fromName}
            />
          </div>
        </fieldset>

        <fieldset className="operator-mail-section">
          <legend>{t('sections.smtp')}</legend>

          <div className="operator-mail-row operator-mail-row--host-port">
            <div className="form-field">
              <label htmlFor="mail-smtp-host">{t('fields.smtpHost')}</label>
              <input
                id="mail-smtp-host"
                value={smtpHost}
                onChange={(event) => setSmtpHost(event.target.value)}
                placeholder={settings.config.smtp.host || '—'}
              />
            </div>

            <div className="form-field">
              <label htmlFor="mail-smtp-port">{t('fields.smtpPort')}</label>
              <input
                id="mail-smtp-port"
                type="number"
                min={1}
                max={65535}
                value={smtpPort}
                onChange={(event) => setSmtpPort(event.target.value)}
                placeholder={String(settings.config.smtp.port)}
              />
            </div>
          </div>

          <div className="operator-toggle-field">
            <span className="operator-toggle-label">{t('fields.smtpSecure')}</span>
            <label className="operator-toggle">
              <input
                type="checkbox"
                checked={displaySecure}
                onChange={(event) => handleSecureToggle(event.target.checked)}
              />
              <span className="operator-toggle-track" aria-hidden="true">
                <span className="operator-toggle-thumb" />
              </span>
              <span className="operator-toggle-text">
                {displaySecure ? t('statusEnabled') : t('statusDisabled')}
              </span>
            </label>
          </div>

          <div className="form-field">
            <label htmlFor="mail-smtp-user">{t('fields.smtpUser')}</label>
            <input
              id="mail-smtp-user"
              value={smtpUser}
              onChange={(event) => setSmtpUser(event.target.value)}
              placeholder={settings.config.smtp.user || '—'}
              autoComplete="off"
            />
          </div>

          <div className="form-field">
            <label htmlFor="mail-smtp-password">{t('fields.smtpPassword')}</label>
            <input
              id="mail-smtp-password"
              type="password"
              autoComplete="new-password"
              value={smtpPassword}
              onChange={(event) => setSmtpPassword(event.target.value)}
              placeholder={
                settings.effective.smtp.passwordConfigured ? t('passwordKeepPlaceholder') : '—'
              }
            />
          </div>
        </fieldset>

        {error && <div className="status-badge error">{error}</div>}

        <div className="operator-mail-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
          {saved && <span className="operator-muted">{t('saved')}</span>}
        </div>
      </form>
    </section>
  )
}
