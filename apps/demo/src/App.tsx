import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ConflictContext } from '@senkronla/client'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, MoonIcon, SunIcon } from './components/icons.tsx'
import { PasswordInput } from './components/PasswordInput.tsx'
import { RichText } from './components/RichText.tsx'
import { FinishScreen } from './components/FinishScreen.tsx'
import { IntroSiteLinks } from './components/IntroSiteLinks.tsx'
import { StepSnippets } from './components/StepSnippets.tsx'
import { StepOutput } from './components/StepOutput.tsx'
import { demoStore, JOIN_PASSWORD_REQUIRED, loadStepIndex, persistStepIndex } from './demo-store.ts'
import { parsePairingQrPayload } from './format-examples.ts'
import { detectLocale, MESSAGES, STEP_IDS, type Locale } from './i18n.ts'

type Theme = 'light' | 'dark'
const THEME_KEY = 'senkronla-theme'
const LOCALE_KEY = 'senkronla-demo.locale'

function initialTheme(): Theme {
  const current = document.documentElement.dataset.theme
  return current === 'dark' ? 'dark' : 'light'
}

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY)
    if (stored === 'en' || stored === 'tr') {
      return stored
    }
  } catch {
    /* ignore */
  }
  return detectLocale()
}

const COMPACT_STEP_DOTS_MQ = '(max-width: 1279px)'
const COMPACT_STEP_DOT_COUNT = 5

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const sync = () => setMatches(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [query])

  return matches
}

function useCompactStepDots(): boolean {
  return useMediaQuery(COMPACT_STEP_DOTS_MQ)
}

function visibleStepDotRange(stepIndex: number, total: number, windowSize: number): [number, number] {
  if (total <= windowSize) {
    return [0, total - 1]
  }

  const half = Math.floor(windowSize / 2)
  let start = stepIndex - half
  let end = stepIndex + half

  if (start < 0) {
    return [0, windowSize - 1]
  }
  if (end >= total) {
    return [total - windowSize, total - 1]
  }
  return [start, end]
}

export function App() {
  const state = useSyncExternalStore(demoStore.subscribe, demoStore.getSnapshot)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const [stepIndex, setStepIndex] = useState(() => loadStepIndex(STEP_IDS.length))
  const [joinOpen, setJoinOpen] = useState(false)
  const [completed, setCompleted] = useState(false)
  const compactStepDots = useCompactStepDots()

  useEffect(() => {
    void demoStore.bootstrapSession()
  }, [])

  useEffect(() => {
    persistStepIndex(stepIndex)
  }, [stepIndex])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = locale
    try {
      localStorage.setItem(LOCALE_KEY, locale)
    } catch {
      /* ignore */
    }
  }, [locale])

  const messages = MESSAGES[locale]
  const ui = messages.ui
  const stepId = STEP_IDS[stepIndex]
  const stepCopy = messages.steps[stepId]
  const total = STEP_IDS.length
  const isLast = stepIndex === total - 1
  const [dotStart, dotEnd] = compactStepDots
    ? visibleStepDotRange(stepIndex, total, COMPACT_STEP_DOT_COUNT)
    : ([0, total - 1] as [number, number])
  const visibleStepIds = STEP_IDS.slice(dotStart, dotEnd + 1)

  function goNext() {
    setStepIndex((index) => Math.min(index + 1, total - 1))
  }
  function goNextOrFinish() {
    if (isLast) {
      setCompleted(true)
      return
    }
    goNext()
  }
  function restartTour() {
    setCompleted(false)
    setStepIndex(0)
  }
  function goPrev() {
    setStepIndex((index) => Math.max(index - 1, 0))
  }
  function goToStep(index: number) {
    setStepIndex(Math.max(0, Math.min(index, total - 1)))
  }

  return (
    <div className="tutorial">
      <header className="toolbar">
        <div className="toolbar-start">
          <span className="toolbar-brand">Senkronla SDK</span>
          <span className="toolbar-step">
            {stepIndex + 1} / {total}
          </span>
        </div>
        <div className="toolbar-end toolbar-actions">
          <button type="button" className="toolbar-btn" onClick={() => setJoinOpen(true)}>
            {ui.header.join}
          </button>
          <div className="segmented" role="group" aria-label="language">
            <button type="button" data-active={locale === 'en'} onClick={() => setLocale('en')}>
              EN
            </button>
            <button type="button" data-active={locale === 'tr'} onClick={() => setLocale('tr')}>
              TR
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={ui.header.themeToggle}
            title={ui.header.themeToggle}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {completed ? (
        <FinishScreen ui={ui} onRestart={restartTour} />
      ) : (
        <div className="split">
        <div className="pane pane-learn">
          <div className="pane-scroll" key={stepId}>
            <div className="step-eyebrow">{stepCopy.eyebrow}</div>
            <h1 className="step-title">{stepCopy.title}</h1>
            <p className="step-subtitle">{stepCopy.subtitle}</p>
            <div className="step-body">
              {stepCopy.body.map((block, index) =>
                block.kind === 'callout' ? (
                  <div key={index} className={`callout callout-${block.tone ?? 'info'}`}>
                    {block.title ? <div className="callout-title">{block.title}</div> : null}
                    <RichText text={block.text} />
                  </div>
                ) : (
                  <p key={index}>
                    <RichText text={block.text} />
                  </p>
                ),
              )}
              {stepId === 'intro' ? (
                <IntroSiteLinks ui={ui} className="intro-links--learn" />
              ) : (
                <StepSnippets
                  step={stepId}
                  dark={theme === 'dark'}
                  sdkLabel={ui.common.sdkLabel}
                  yoursLabel={ui.common.yoursLabel}
                  yoursHint={ui.common.yoursHint}
                  copyLabel={ui.common.copy}
                  copiedLabel={ui.common.copied}
                  persistRecoveryPhrase={state.persistRecoveryPhrase}
                />
              )}
            </div>
          </div>
          <nav className="pane-footer" aria-label={ui.common.stepNav}>
            <button
              type="button"
              className="btn btn-ghost pane-footer-nav pane-footer-nav--prev"
              onClick={goPrev}
              disabled={stepIndex === 0}
              aria-label={ui.common.prev}
            >
              <ChevronLeftIcon className="pane-footer-nav-icon" />
              <span className="pane-footer-nav-label">← {ui.common.prev}</span>
            </button>
            <div className="step-dots" role="group" aria-label={ui.common.stepNav}>
              {visibleStepIds.map((id, offset) => {
                const index = dotStart + offset
                const title = messages.steps[id].title
                const active = index === stepIndex
                return (
                  <button
                    key={id}
                    type="button"
                    className="step-dot"
                    data-active={active}
                    aria-current={active ? 'step' : undefined}
                    aria-label={`${index + 1}. ${title}`}
                    onClick={() => goToStep(index)}
                  >
                    <span className="step-dot-tooltip">{title}</span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="btn btn-primary pane-footer-nav pane-footer-nav--next"
              onClick={goNextOrFinish}
              aria-label={isLast ? ui.common.finish : ui.common.next}
            >
              {isLast ? (
                <CheckIcon className="pane-footer-nav-icon pane-footer-nav-icon--finish" />
              ) : (
                <ChevronRightIcon className="pane-footer-nav-icon" />
              )}
              <span className="pane-footer-nav-label">
                {isLast ? ui.common.finish : ui.common.next} →
              </span>
            </button>
          </nav>
        </div>

        <section className="pane pane-output" aria-label={stepCopy.outputTitle}>
          <div className="pane-scroll">
            <h2 className="output-label">{stepCopy.outputTitle}</h2>
            <StepOutput step={stepId} state={state} ui={ui} onNext={goNext} dark={theme === 'dark'} />
          </div>
        </section>
        </div>
      )}

      {joinOpen ? (
        <JoinModal ui={ui} busy={state.busy} onClose={() => setJoinOpen(false)} />
      ) : null}

      {state.pendingConflict ? (
        <ConflictModal
          ctx={state.pendingConflict}
          ui={ui}
          onResolve={(choice) => demoStore.resolveConflict(choice)}
        />
      ) : null}
    </div>
  )
}

function ConflictModal({
  ctx,
  ui,
  onResolve,
}: {
  ctx: ConflictContext
  ui: typeof MESSAGES.en.ui
  onResolve: (choice: 'local' | 'remote' | 'cancel') => void
}) {
  const remoteWrittenAt = new Date(ctx.remoteMeta.writtenAt).toLocaleString()

  return (
    <div
      className="modal-overlay modal-overlay--conflict"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
      onClick={() => onResolve('cancel')}
    >
      <div className="modal modal--conflict" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header modal-header--conflict">
          <h3 id="conflict-modal-title">{ui.conflict.modalTitle}</h3>
          <p>{ui.conflict.modalDesc}</p>
        </div>
        <div className="modal-body conflict-modal-body">
          <div className="conflict-compare">
            <section className="conflict-side conflict-side--local" aria-labelledby="conflict-local-title">
              <div className="conflict-side-head">
                <h4 id="conflict-local-title">{ui.conflict.localTitle}</h4>
              </div>
              <dl className="conflict-meta">
                <div className="conflict-meta-row">
                  <dt>{ui.conflict.revision}</dt>
                  <dd>{ctx.knownRevision ?? '—'}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="btn btn-secondary conflict-side-action"
                onClick={() => onResolve('local')}
              >
                {ui.conflict.keepLocal}
              </button>
            </section>

            <section className="conflict-side conflict-side--remote" aria-labelledby="conflict-remote-title">
              <div className="conflict-side-head">
                <h4 id="conflict-remote-title">{ui.conflict.remoteTitle}</h4>
              </div>
              <dl className="conflict-meta">
                <div className="conflict-meta-row">
                  <dt>{ui.conflict.revision}</dt>
                  <dd>{ctx.remoteRevision}</dd>
                </div>
                <div className="conflict-meta-row">
                  <dt>{ui.conflict.writtenAt}</dt>
                  <dd>{remoteWrittenAt}</dd>
                </div>
                <div className="conflict-meta-row">
                  <dt>{ui.conflict.device}</dt>
                  <dd>{ctx.remoteMeta.deviceId}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="btn btn-primary conflict-side-action"
                onClick={() => onResolve('remote')}
              >
                {ui.conflict.keepRemote}
              </button>
            </section>
          </div>

          <div className="conflict-modal-footer">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onResolve('cancel')}>
              {ui.conflict.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function JoinModal({
  ui,
  busy,
  onClose,
}: {
  ui: typeof MESSAGES.en.ui
  busy: boolean
  onClose: () => void
}) {
  const [qrPayload, setQrPayload] = useState('')
  const [namespaceId, setNamespaceId] = useState('')
  const [code, setCode] = useState('')
  const [syncPassword, setSyncPassword] = useState('')
  const [payloadError, setPayloadError] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const canSubmit =
    namespaceId.trim().length > 0 && /^\d{6}$/.test(code.trim()) && !busy

  function joinErrorMessage(message: string | null): string | null {
    if (!message) return null
    if (message === JOIN_PASSWORD_REQUIRED) {
      return ui.header.joinPasswordRequired
    }
    return message
  }

  function handleQrPayloadChange(value: string) {
    setQrPayload(value)
    if (!value.trim()) {
      setPayloadError(false)
      return
    }
    const parsed = parsePairingQrPayload(value)
    if (parsed) {
      setPayloadError(false)
      setNamespaceId(parsed.namespaceId)
      setCode(parsed.code)
      return
    }
    setPayloadError(true)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setJoinError(null)
    const ok = await demoStore.joinPairing(namespaceId, code, syncPassword)
    if (ok) {
      onClose()
      return
    }
    setJoinError(demoStore.getSnapshot().error)
  }

  function dismissModal(): void {
    if (busy) return
    onClose()
  }

  return (
    <div
      className="modal-overlay modal-overlay--join"
      role="dialog"
      aria-modal="true"
      onClick={joinError ? undefined : dismissModal}
    >
      <div className="modal modal--join" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{ui.header.joinTitle}</h3>
          <p>{ui.header.joinDesc}</p>
        </div>
        <form className="modal-body join-modal-body" onSubmit={submit}>
          <div className="field">
            <label htmlFor="join-qr">{ui.header.joinQrLabel}</label>
            <textarea
              id="join-qr"
              rows={2}
              autoFocus
              placeholder={ui.header.joinQrPlaceholder}
              value={qrPayload}
              onChange={(event) => handleQrPayloadChange(event.target.value)}
            />
            {payloadError ? <p className="field-hint field-hint-error">{ui.header.joinInvalidPayload}</p> : null}
          </div>

          <p className="join-or-manual">{ui.header.joinOrManual}</p>

          <div className="field">
            <label htmlFor="join-namespace">{ui.header.joinNamespaceLabel}</label>
            <input
              id="join-namespace"
              placeholder={ui.header.joinNamespacePlaceholder}
              value={namespaceId}
              onChange={(event) => setNamespaceId(event.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="join-code">{ui.header.joinCodeLabel}</label>
            <input
              id="join-code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder={ui.header.joinCodePlaceholder}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
            />
          </div>
          <div className="field">
            <label htmlFor="join-password">{ui.header.joinPasswordLabel}</label>
            <PasswordInput
              id="join-password"
              placeholder={ui.header.joinPasswordPlaceholder}
              value={syncPassword}
              onChange={setSyncPassword}
              showLabel={ui.common.showPassword}
              hideLabel={ui.common.hidePassword}
            />
            <p className="field-hint">{ui.header.joinPasswordHint}</p>
          </div>

          {joinErrorMessage(joinError) ? (
            <p className="error-text">{joinErrorMessage(joinError)}</p>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={dismissModal} disabled={busy}>
              {ui.conflict.cancel}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {busy ? ui.common.busy : ui.header.joinSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
