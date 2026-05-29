'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { usePageScrollLock } from '@/hooks/use-page-scroll-lock'

interface ApiErrorBody {
  error?: { message?: string; code?: string }
}

function formatPasswordError(
  body: ApiErrorBody,
  t: ReturnType<typeof useTranslations<'developer'>>,
): string {
  if (body.error?.code === 'DEVELOPER_INVALID_CREDENTIALS') {
    return t('currentPasswordIncorrect')
  }

  return body.error?.message ?? t('passwordChangeFailed')
}

export function DeveloperAccountPanel({
  profileEmail,
  apiOrigin,
  onLogout,
}: {
  profileEmail: string | null
  apiOrigin: string
  onLogout: () => void
}) {
  const t = useTranslations('developer')

  const [modalOpen, setModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const closeModal = useCallback(() => {
    if (loading) {
      return
    }

    setModalOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
  }, [loading])

  const openModal = useCallback(() => {
    setNotice(null)
    setError(null)
    setModalOpen(true)
  }, [])

  usePageScrollLock(modalOpen, 'developer-password-modal')

  useEffect(() => {
    if (!modalOpen) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeModal()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeModal, modalOpen])

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/developer/auth/password', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      const body = (await response.json()) as ApiErrorBody

      if (!response.ok) {
        setError(formatPasswordError(body, t))
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setModalOpen(false)
      setNotice(t('passwordChanged'))
    } catch {
      setError(t('passwordChangeFailed'))
    } finally {
      setLoading(false)
    }
  }

  const modal =
    modalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div className="operator-modal-overlay" role="presentation" onClick={closeModal}>
            <div
              className="operator-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="developer-password-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="operator-modal-header">
                <div>
                  <h3 id="developer-password-modal-title">{t('changePasswordTitle')}</h3>
                  {profileEmail && <p className="operator-muted">{profileEmail}</p>}
                </div>
                <button
                  type="button"
                  className="operator-modal-close"
                  aria-label={t('closeModal')}
                  disabled={loading}
                  onClick={closeModal}
                >
                  ×
                </button>
              </header>

              <div className="operator-modal-body">
                <form className="operator-modal-form" onSubmit={handlePasswordChange}>
                  <div className="form-field">
                    <label htmlFor="developer-current-password">{t('currentPassword')}</label>
                    <input
                      id="developer-current-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="developer-new-password">{t('newPassword')}</label>
                    <input
                      id="developer-new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      minLength={8}
                      required
                    />
                    <span className="form-hint">{t('passwordHint')}</span>
                  </div>

                  <div className="form-field">
                    <label htmlFor="developer-confirm-password">{t('confirmPassword')}</label>
                    <input
                      id="developer-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      minLength={8}
                      required
                    />
                  </div>

                  <div className="operator-modal-actions">
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? t('changingPassword') : t('changePassword')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={loading}
                      onClick={closeModal}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </form>

                {error && (
                  <div className="developer-auth-error" role="alert">
                    {error}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <section className="developer-account-card card">
        <div className="developer-account-summary">
          <div>
            <h2>{t('accountTitle')}</h2>
            {profileEmail && <p className="operator-muted">{profileEmail}</p>}
          </div>
          <div className="developer-account-actions">
            <button type="button" className="btn btn-secondary" onClick={openModal}>
              {t('changePassword')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onLogout}>
              {t('logout')}
            </button>
          </div>
        </div>

        {notice && (
          <div className="developer-auth-notice" role="status">
            {notice}
          </div>
        )}

        <footer className="developer-account-footer">
          <span className="operator-muted">{t('apiOriginLabel')}</span>
          <code className="developer-auth-api-origin">{apiOrigin}</code>
        </footer>
      </section>

      {modal}
    </>
  )
}
