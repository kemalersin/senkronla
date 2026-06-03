import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { demoStore, RELAY_HEALTH_FAILED, type DemoState } from '../demo-store.ts'
import {
  demoJsonForDisplay,
  formatConflictResponse,
  formatHeadMetaResponse,
  formatPairingResponse,
} from '../format-examples.ts'
import type { StepId, UiMessages } from '../i18n.ts'
import { CodeBlock } from './CodeBlock.tsx'
import { PasswordInput } from './PasswordInput.tsx'

interface StepOutputProps {
  step: StepId
  state: DemoState
  ui: UiMessages
  onNext: () => void
  dark: boolean
}

type Tone = 'ok' | 'busy' | 'error' | 'idle'

function statusTone(status: string): Tone {
  if (status === 'ws_connected' || status === 'idle') return 'ok'
  if (status === 'syncing' || status === 'pending_push' || status === 'remote_pending') return 'busy'
  if (status === 'error' || status === 'offline') return 'error'
  return 'idle'
}

function StatusBadge({ state, ui }: { state: DemoState; ui: UiMessages }) {
  const label = ui.status[state.status] ?? state.status
  return (
    <span className="status-badge" data-tone={statusTone(state.status)}>
      <span className="status-dot" />
      {state.connecting ? ui.common.busy : label}
    </span>
  )
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null
  return <p className="error-text">{error}</p>
}

export function StepOutput({ step, state, ui, onNext, dark }: StepOutputProps) {
  useEffect(() => {
    if (step !== 'syncData' && step !== 'encryption') {
      return
    }
    void demoStore.buildEnvelopePreview()
  }, [step, state.doc, state.syncPassword, state.encryptionEnabled])

  useEffect(() => {
    if (step !== 'namespace' || !state.connected || state.connecting) {
      return
    }
    if (
      state.namespaceResponse !== null &&
      state.namespaceCommittedAtEpoch === state.connectionEpoch
    ) {
      return
    }
    void demoStore.refreshNamespace()
  }, [
    step,
    state.connected,
    state.connecting,
    state.connectionEpoch,
    state.namespaceCommittedAtEpoch,
    state.namespaceResponse,
  ])

  switch (step) {
    case 'intro':
      return <IntroOutput ui={ui} onNext={onNext} />
    case 'install':
      return <InstallOutput state={state} ui={ui} dark={dark} />
    case 'document':
      return <DocumentOutput state={state} ui={ui} dark={dark} />
    case 'connect':
      return <ConnectOutput state={state} ui={ui} dark={dark} />
    case 'namespace':
      return <NamespaceOutput state={state} ui={ui} dark={dark} />
    case 'recovery':
      return <RecoveryOutput state={state} ui={ui} dark={dark} />
    case 'sync':
      return <SyncOutput state={state} ui={ui} dark={dark} />
    case 'pairing':
      return <PairingOutput state={state} ui={ui} dark={dark} />
    case 'syncData':
      return <SyncDataOutput state={state} ui={ui} dark={dark} />
    case 'conflict':
      return <ConflictOutput state={state} ui={ui} dark={dark} />
    case 'encryption':
      return <EncryptionOutput state={state} ui={ui} dark={dark} />
    case 'notifications':
      return <NotificationsOutput state={state} ui={ui} dark={dark} />
    default:
      return null
  }
}

function IntroOutput({ ui, onNext }: { ui: UiMessages; onNext: () => void }) {
  const cards = [
    { title: ui.intro.zeroKnowledge, desc: ui.intro.zeroKnowledgeDesc },
    { title: ui.intro.offlineFirst, desc: ui.intro.offlineFirstDesc },
    { title: ui.intro.e2ee, desc: ui.intro.e2eeDesc },
    { title: ui.intro.liveUpdates, desc: ui.intro.liveUpdatesDesc },
  ]
  return (
    <div className="output-body">
      <div className="kv" style={{ gap: '0.75rem' }}>
        {cards.map((card, index) => (
          <div key={card.title} className="feature-row feature-row--numbered">
            <span className="feature-row-num" aria-hidden="true">
              {index + 1}
            </span>
            <div className="feature-row-body">
              <strong>{card.title}</strong>
              <span>{card.desc}</span>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-primary" onClick={onNext}>
        {ui.intro.start}
      </button>
    </div>
  )
}

function InstallOutput({ state, ui }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  return (
    <div className="output-body">
      <div className="feature-row">
        <div>
          <strong>{ui.install.package}</strong>
          <span>{ui.install.includes}</span>
        </div>
        <span className="tag">v{state.sdkVersion}</span>
      </div>
    </div>
  )
}

function DocumentOutput({ state, ui, dark }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  const [draft, setDraft] = useState('')
  function submit(event: React.FormEvent) {
    event.preventDefault()
    demoStore.addNote(draft)
    setDraft('')
  }
  return (
    <div className="output-body">
      <div className="field">
        <label htmlFor="workspace">{ui.document.workspaceLabel}</label>
        <input
          id="workspace"
          value={state.doc.workspace}
          onChange={(event) => demoStore.setWorkspaceName(event.target.value)}
        />
      </div>
      <form className="inline-form" onSubmit={submit}>
        <div className="field">
          <input
            placeholder={ui.document.notePlaceholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-sm">
          {ui.document.addNote}
        </button>
      </form>
      {state.doc.notes.length === 0 ? (
        <p className="output-hint">{ui.document.emptyNotes}</p>
      ) : (
        <ul className="note-list">
          {state.doc.notes.map((note) => (
            <li key={note.id} className="note-item">
              <span>{note.text}</span>
              <button
                type="button"
                className="note-remove"
                aria-label="remove"
                onClick={() => demoStore.removeNote(note.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <CodeBlock
        code={JSON.stringify(state.doc, null, 2)}
        language="json"
        dark={dark}
        label={ui.document.previewTitle}
        copyLabel={ui.common.copy}
        copiedLabel={ui.common.copied}
        compact
      />
    </div>
  )
}

function connectErrorMessage(error: string | null, ui: UiMessages): string | null {
  if (!error) return null
  if (error === RELAY_HEALTH_FAILED) {
    return ui.connect.healthFailed
  }
  return error
}

function ConnectStatusBadge({ state, ui }: { state: DemoState; ui: UiMessages }) {
  if (state.connecting) {
    return (
      <span className="status-badge" data-tone="busy">
        <span className="status-dot" />
        {ui.common.busy}
      </span>
    )
  }
  if (state.connected && state.healthResponse !== null) {
    return (
      <span className="status-badge" data-tone="ok">
        <span className="status-dot" />
        {ui.connect.connected}
      </span>
    )
  }
  return (
    <span className="status-badge" data-tone="idle">
      <span className="status-dot" />
      {ui.connect.disconnected}
    </span>
  )
}

function ConnectOutput({ state, ui, dark }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  const appsLabel =
    state.healthResponse === null
      ? ui.connect.appsUnknown
      : state.appsEnabled
        ? ui.connect.appsEnabled
        : ui.connect.appsDisabled
  return (
    <div className="output-body">
      <div className="field">
        <label htmlFor="relay">{ui.connect.relayLabel}</label>
        <input
          id="relay"
          value={state.relayUrl}
          onChange={(event) => demoStore.setRelayUrl(event.target.value)}
          disabled={state.connecting}
        />
      </div>
      <div className="field">
        <label htmlFor="appid">
          {ui.connect.appIdLabel} <span className="output-hint">— {ui.connect.appIdHint}</span>
        </label>
        <input
          id="appid"
          value={state.appId}
          onChange={(event) => demoStore.setAppId(event.target.value)}
          disabled={state.connecting}
        />
      </div>
      {state.healthResponse !== null ? (
        <div className="callout callout-info">
          <div className="callout-title">{ui.connect.healthTitle}</div>
          {appsLabel}
          {state.appsEnabled ? <div style={{ marginTop: '0.35rem' }}>{ui.connect.registerInfo}</div> : null}
        </div>
      ) : null}
      <div className="toggle-row">
        <div className="toggle-row-text">
          <strong className="toggle-row-id">persistRecoveryPhrase</strong>
          <span>{ui.connect.persistNote}</span>
        </div>
        <button
          type="button"
          className="switch"
          data-on={state.persistRecoveryPhrase}
          aria-label={ui.connect.persistEnable}
          disabled={state.connecting}
          onClick={() => void demoStore.applyPersistRecoveryPhrase(!state.persistRecoveryPhrase)}
        />
      </div>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!demoStore.canConnectOrReconnect()}
          onClick={() =>
            void demoStore.connect(state.connected ? { preserveHealth: true } : undefined)
          }
        >
          {state.connected ? ui.connect.reconnect : ui.connect.connect}
        </button>
        <ConnectStatusBadge state={state} ui={ui} />
      </div>
      <ErrorText error={connectErrorMessage(state.error, ui)} />
      {state.healthResponse !== null ? (
        <CodeBlock
          code={demoJsonForDisplay(state.healthResponse)}
          language="json"
          dark={dark}
          label={ui.common.response}
          copyLabel={ui.common.copy}
          copiedLabel={ui.common.copied}
          compact
        />
      ) : (
        <p className="output-hint">{state.connected ? ui.connect.empty : ui.connect.appsUnknown}</p>
      )}
    </div>
  )
}

function NamespaceOutput({ state, ui, dark }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  return (
    <div className="output-body">
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!demoStore.canEnsureNamespace()}
          onClick={() => void demoStore.ensureNamespace()}
        >
          {state.busy ? ui.common.busy : ui.namespace.create}
        </button>
        <StatusBadge state={state} ui={ui} />
      </div>
      {state.namespaceResponse === null ? (
        <p className="output-hint">{ui.namespace.empty}</p>
      ) : (
        <CodeBlock
          code={demoJsonForDisplay(state.namespaceResponse)}
          language="json"
          dark={dark}
          label={ui.common.response}
          copyLabel={ui.common.copy}
          copiedLabel={ui.common.copied}
          compact
        />
      )}
      <ErrorText error={state.error} />
    </div>
  )
}

function RecoveryEmptyState({ state, ui }: { state: DemoState; ui: UiMessages }) {
  if (state.recoveryPhraseAcknowledged) {
    return (
      <div className="output-body">
        <div className="callout callout-info">
          <div className="callout-title">{ui.recovery.acknowledgedTitle}</div>
          {ui.recovery.acknowledged}
        </div>
      </div>
    )
  }

  if (state.namespaceResponse !== null && state.namespaceCreated === false) {
    return (
      <div className="output-body">
        <div className="callout callout-info">
          <div className="callout-title">{ui.recovery.existingTitle}</div>
          {ui.recovery.existingNamespace}
        </div>
      </div>
    )
  }

  if (state.namespaceResponse !== null) {
    return (
      <div className="output-body">
        <div className="callout callout-warn">
          <div className="callout-title">{ui.recovery.unavailableTitle}</div>
          {ui.recovery.unavailable}
        </div>
      </div>
    )
  }

  return (
    <div className="output-body">
      <p className="output-hint">{ui.recovery.empty}</p>
    </div>
  )
}

function RecoveryOutput({ state, ui }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  const [saved, setSaved] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  async function copyWord(word: string, index: number) {
    try {
      await navigator.clipboard.writeText(word)
      setCopiedIndex(index)
      window.setTimeout(() => {
        setCopiedIndex((current) => (current === index ? null : current))
      }, 1500)
    } catch {
      /* ignore */
    }
  }

  async function copyFullPhrase(phrase: string) {
    try {
      await navigator.clipboard.writeText(phrase)
      setCopiedAll(true)
      window.setTimeout(() => setCopiedAll(false), 1500)
    } catch {
      /* ignore */
    }
  }

  if (!state.recoveryPhrase) {
    return <RecoveryEmptyState state={state} ui={ui} />
  }
  const words = state.recoveryPhrase.split(/\s+/)
  return (
    <div className="output-body">
      <div className="callout callout-warn">
        <div className="callout-title">{ui.recovery.warnTitle}</div>
        {ui.recovery.warn}
      </div>
      <p className="output-hint">{ui.recovery.copyHint}</p>
      <div className="phrase-grid">
        {words.map((word, index) => (
          <button
            key={index}
            type="button"
            className="phrase-word"
            data-copied={copiedIndex === index}
            aria-label={`${ui.recovery.copyWord} ${index + 1}`}
            title={ui.recovery.copyWord}
            onClick={() => void copyWord(word, index)}
          >
            <b>{index + 1}</b>
            <span>{copiedIndex === index ? ui.common.copied : word}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void copyFullPhrase(state.recoveryPhrase!)}
        >
          {copiedAll ? ui.common.copied : ui.recovery.copyAll}
        </button>
        <button
          type="button"
          className={saved ? 'btn btn-secondary' : 'btn btn-primary'}
          onClick={() => {
            demoStore.acknowledgeRecoveryPhrase()
            setSaved(true)
          }}
        >
          {saved ? ui.common.copied : ui.recovery.saved}
        </button>
      </div>
    </div>
  )
}

function SyncOutput({ state, ui, dark }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  return (
    <div className="output-body">
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!demoStore.canSyncNow()}
          onClick={() => void demoStore.syncNow()}
        >
          {state.busy ? ui.common.busy : ui.sync.run}
        </button>
        <StatusBadge state={state} ui={ui} />
      </div>
      {state.lastMeta ? (
        <CodeBlock
          key={state.lastMeta.revision}
          code={formatHeadMetaResponse(state.lastMeta)}
          language="json"
          dark={dark}
          label={ui.common.response}
          copyLabel={ui.common.copy}
          copiedLabel={ui.common.copied}
          compact
        />
      ) : (
        <p className="output-hint">{ui.sync.empty}</p>
      )}
      <ErrorText error={state.error} />
    </div>
  )
}

function PairingOutput({ state, ui, dark }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  const [qrCopied, setQrCopied] = useState(false)

  async function copyQrPayload(payload: string) {
    try {
      await navigator.clipboard.writeText(payload)
      setQrCopied(true)
      window.setTimeout(() => setQrCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="output-body">
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!state.connected || state.busy}
          onClick={() => void demoStore.startPairing()}
        >
          {state.busy ? ui.common.busy : ui.pairing.start}
        </button>
      </div>
      {state.pairing ? (
        <>
          <div className="qr-wrap">
            <button
              type="button"
              className="qr-copy"
              data-copied={qrCopied}
              aria-label={ui.pairing.copyQrAria}
              title={ui.pairing.copyQrAria}
              onClick={() => void copyQrPayload(state.pairing!.qrPayload)}
            >
              <div className="qr-frame">
                <QRCodeSVG value={state.pairing.qrPayload} size={148} level="M" />
              </div>
              <span className="qr-copy-hint">{qrCopied ? ui.common.copied : ui.pairing.copyQrHint}</span>
            </button>
            <div className="pairing-code">{state.pairing.code}</div>
            <div className="pairing-expiry">
              <span className="pairing-expiry-label">{ui.pairing.expires}</span>
              <time className="pairing-expiry-time" dateTime={state.pairing.expiresAt}>
                {new Date(state.pairing.expiresAt).toLocaleTimeString()}
              </time>
            </div>
            <p className="output-hint" style={{ textAlign: 'center' }}>
              {ui.pairing.joinHint}
            </p>
          </div>
          <CodeBlock
            code={formatPairingResponse(state.pairing)}
            language="json"
            dark={dark}
            label={ui.common.response}
            copyLabel={ui.common.copy}
            copiedLabel={ui.common.copied}
            compact
          />
        </>
      ) : (
        <p className="output-hint">{ui.pairing.empty}</p>
      )}
      <ErrorText error={state.error} />
    </div>
  )
}

function SyncDataOutput({ state, ui, dark }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  const [draft, setDraft] = useState('')
  const encrypted = state.encryptionEnabled && state.syncPassword.trim().length > 0
  const canPush =
    state.connected &&
    !state.busy &&
    draft.trim().length > 0 &&
    (!state.encryptionEnabled || state.syncPassword.trim().length > 0)
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.trim() || !canPush) return
    void demoStore.pushData(draft)
    setDraft('')
  }
  return (
    <div className="output-body">
      {state.encryptionEnabled ? (
        <div className="status-badge" data-tone={encrypted ? 'ok' : 'idle'}>
          <span className="status-dot" />
          {encrypted ? ui.syncData.encryptionOn : ui.syncData.needsPassword}
        </div>
      ) : null}
      <form className="inline-form" onSubmit={submit}>
        <div className="field">
          <input
            placeholder={ui.syncData.notePlaceholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!canPush}>
          {ui.syncData.push}
        </button>
      </form>
      <div className="callout callout-info">
        <div className="callout-title">{ui.syncData.opaqueTitle}</div>
        {encrypted ? ui.syncData.opaqueEncrypted : ui.syncData.opaque}
      </div>
      {state.envelopePreview ? (
        <CodeBlock
          code={state.envelopePreview}
          language="json"
          dark={dark}
          label={encrypted ? ui.syncData.envelopeTitleEncrypted : ui.syncData.envelopeTitle}
          copyLabel={ui.common.copy}
          copiedLabel={ui.common.copied}
          compact
          maxHeight="24rem"
        />
      ) : (
        <p className="output-hint">{ui.syncData.empty}</p>
      )}
      <ErrorText error={state.error} />
    </div>
  )
}

function ConflictOutput({ state, ui, dark }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  return (
    <div className="output-body">
      <div className="callout callout-info">
        <div className="callout-title">{ui.conflict.explainTitle}</div>
        {ui.conflict.explain}
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!state.connected || state.busy}
        onClick={() => void demoStore.simulateConflict()}
      >
        {ui.conflict.simulate}
      </button>
      {state.lastConflictContext ? (
        <CodeBlock
          code={formatConflictResponse(state.lastConflictContext)}
          language="json"
          dark={dark}
          label={ui.common.response}
          copyLabel={ui.common.copy}
          copiedLabel={ui.common.copied}
          compact
        />
      ) : (
        <p className="output-hint">{ui.conflict.empty}</p>
      )}
      <ErrorText error={state.error} />
    </div>
  )
}

function EncryptionOutput({ state, ui, dark }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  return (
    <div className="output-body">
      <div className="toggle-row">
        <div className="toggle-row-text">
          <strong className="toggle-row-id">encrypt</strong>
          <span>{ui.encryption.note}</span>
        </div>
        <button
          type="button"
          className="switch"
          data-on={state.encryptionEnabled}
          aria-label={ui.encryption.enable}
          onClick={() => demoStore.setEncryptionEnabled(!state.encryptionEnabled)}
        />
      </div>
      <div className="field">
        <label htmlFor="syncpass">{ui.encryption.passwordLabel}</label>
        <PasswordInput
          id="syncpass"
          placeholder={ui.encryption.passwordPlaceholder}
          value={state.syncPassword}
          onChange={(value) => demoStore.setSyncPassword(value)}
          showLabel={ui.common.showPassword}
          hideLabel={ui.common.hidePassword}
        />
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={!demoStore.canApplyEncryption()}
        onClick={() => void demoStore.commitEncryption()}
      >
        {state.busy ? ui.common.busy : ui.common.run}
      </button>
      {state.encryptedPreview ? (
        <>
          <CodeBlock
            code={state.encryptedPreview}
            language="json"
            dark={dark}
            label={ui.encryption.encryptedTitle}
            copyLabel={ui.common.copy}
            copiedLabel={ui.common.copied}
            compact
            maxHeight="16rem"
          />
          <CodeBlock
            code={state.plaintextPreview ?? '{}'}
            language="json"
            dark={dark}
            label={ui.encryption.plaintextTitle}
            copyLabel={ui.common.copy}
            copiedLabel={ui.common.copied}
            compact
            maxHeight="14rem"
          />
        </>
      ) : (
        <p className="output-hint">{ui.encryption.empty}</p>
      )}
      <ErrorText error={state.error} />
    </div>
  )
}

function NotificationsOutput({ state, ui, dark }: { state: DemoState; ui: UiMessages; dark: boolean }) {
  const wsLabel = !state.notificationsEnabled
    ? ui.notifications.disabled
    : state.notificationConnected
      ? ui.notifications.connected
      : ui.notifications.disconnected

  return (
    <div className="output-body">
      <div className="toggle-row">
        <div className="toggle-row-text">
          <strong className="toggle-row-id">notificationsEnabled</strong>
          <span>{ui.notifications.tip}</span>
        </div>
        <button
          type="button"
          className="switch"
          data-on={state.notificationsEnabled}
          aria-label={ui.notifications.enable}
          onClick={() => void demoStore.applyNotifications(!state.notificationsEnabled)}
        />
      </div>
      <div
        className="status-badge"
        data-tone={state.notificationsEnabled && state.notificationConnected ? 'ok' : 'idle'}
      >
        <span className="status-dot" />
        {ui.notifications.wsState}: {wsLabel}
      </div>
      {state.lastNotification ? (
        <CodeBlock
          code={state.lastNotification}
          language="json"
          dark={dark}
          label={ui.common.response}
          copyLabel={ui.common.copy}
          copiedLabel={ui.common.copied}
          compact
        />
      ) : (
        <p className="output-hint">{ui.notifications.empty}</p>
      )}
      {state.notificationLog.length > 0 ? (
        <ul className="log-list">
          {state.notificationLog.map((entry) => (
            <li key={entry.id} className="log-item">
              <span className="log-time">{entry.at}</span>
              <span>{entry.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <ErrorText error={state.error} />
    </div>
  )
}
