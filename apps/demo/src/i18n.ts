export type Locale = 'en' | 'tr'

export const STEP_IDS = [
  'intro',
  'install',
  'document',
  'connect',
  'namespace',
  'recovery',
  'sync',
  'encryption',
  'syncData',
  'pairing',
  'conflict',
  'notifications',
] as const

export type StepId = (typeof STEP_IDS)[number]

export interface Block {
  kind: 'p' | 'callout'
  text: string
  tone?: 'info' | 'warn'
  title?: string
}

export interface StepCopy {
  eyebrow: string
  title: string
  subtitle: string
  body: Block[]
  outputTitle: string
}

export interface StepSnippet {
  lang: string
  sdk: string
  /** Example code the integrator writes — shown below the SDK block when set. */
  yours?: string
}

export function formatConnectSdkSnippet(persistRecoveryPhrase: boolean, deviceLabel: string): string {
  const persistLine = persistRecoveryPhrase
    ? '  persistRecoveryPhrase: true, // optional — save phrase in StorageAdapter\n'
    : ''
  const escapedLabel = deviceLabel.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `import { EsrSync, createLocalStorageAdapter } from '@senkronla/client'

const sync = await EsrSync.connect({
  relayUrl: 'https://sync.senkron.la/v1',
  appId: 'esr_app_demo', // required when the relay has apps.enabled
  deviceLabel: '${escapedLabel}',
  storage: createLocalStorageAdapter(),
  document,
  onRecoveryPhrase,
  onConflict,
${persistLine}})`
}

export function formatConnectYoursSnippet(persistRecoveryPhrase: boolean): string {
  const persistComment = persistRecoveryPhrase
    ? '\n\n// persistRecoveryPhrase: true → SDK writes the phrase to storage too'
    : ''
  return `// Your app — UI hooks the SDK calls during sync
function showRecoveryModal(phrase: string) {
  // Shown exactly once; user must store offline
}

async function askKeepLocalOrRemote(ctx: ConflictContext) {
  // Compare ctx.knownRevision vs ctx.remoteRevision
  return 'local' // | 'remote' | 'cancel'
}

const onRecoveryPhrase = ({ phrase }: { phrase: string }) => {
  showRecoveryModal(phrase)
}

const onConflict = (ctx: ConflictContext) => askKeepLocalOrRemote(ctx)${persistComment}`
}

/** Left-pane code: SDK usage + optional “your app” examples. */
export const SNIPPETS: Record<StepId, StepSnippet> = {
  intro: {
    lang: 'markdown',
    sdk: '',
  },
  install: {
    lang: 'bash',
    sdk: `npm install @senkronla/client
# @senkronla/protocol is installed automatically`,
  },
  document: {
    lang: 'typescript',
    sdk: `import { createDocumentAdapter } from '@senkronla/client'

const document = createDocumentAdapter({
  namespaceId,
  namespaceLabel: 'Demo workspace',
  contentType: 'application/vnd.senkronla-demo+json',
  exportDocument,
  importDocument,
})`,
    yours: `// Your app — document model the SDK never sees decrypted on the relay
const store = {
  state: { workspace: 'My workspace', notes: [] as Note[] },
  replace(data: DemoDoc) {
    store.state = data
  },
}

function exportDocument() {
  return store.state
}

function importDocument(data: DemoDoc) {
  store.replace(data)
}`,
  },
  connect: {
    lang: 'typescript',
    sdk: formatConnectSdkSnippet(false, 'Alice laptop'),
    yours: formatConnectYoursSnippet(false),
  },
  namespace: {
    lang: 'typescript',
    sdk: `const result = await sync.ensureNamespace()
// { namespaceId, created: true, recoveryPhrase?: '...' }`,
  },
  recovery: {
    lang: 'typescript',
    sdk: `onRecoveryPhrase: ({ phrase, namespaceId }) => {
  showRecoveryModal(phrase)
},
// Optional — store the phrase in your StorageAdapter (e.g. localStorage)
persistRecoveryPhrase: true, // for sync.recover() on this device later`,
    yours: `function showRecoveryModal(phrase: string) {
  // Modal, paper backup, password manager export — your choice
}

// With persistRecoveryPhrase: true the SDK also saves the phrase
// in storage — only if that matches your threat model on this device`,
  },
  sync: {
    lang: 'typescript',
    sdk: `await sync.sync()

sync.getStatus() // 'idle' | 'syncing' | 'ws_connected' | 'pending_push' | ...`,
  },
  pairing: {
    lang: 'typescript',
    sdk: `// Host device — create a short-lived pairing code
const { code, qrPayload, expiresAt } = await sync.startPairing()

// Guest device — namespaceId comes from qrPayload; wire adapters, then redeem
await sync.joinPairing(codeFromQr)`,
    yours: `function renderQrCode(qrPayload: string) {
  // esr://pair/v1/{namespaceId}?code=… — scan or paste in Join modal
}`,
  },
  syncData: {
    lang: 'typescript',
    sdk: `sync.notifyLocalChange()
// sync() is optional — the SDK debounces and pushes on its own.
await sync.sync() // this demo: immediate push to inspect the envelope

// The relay only ever sees the opaque ESR-DOC1 envelope.`,
    yours: `store.addNote('Buy milk')
store.onChange(() => sync.notifyLocalChange())
// No sync() after every edit — debounced push handles it (see step 7 for manual sync())`,
  },
  conflict: {
    lang: 'typescript',
    sdk: `onConflict: async (ctx) => {
  // ctx.knownRevision, ctx.remoteRevision, ctx.remoteMeta.writtenAt
  return await askKeepLocalOrRemote(ctx) // 'local' | 'remote' | 'cancel'
}`,
    yours: `async function askKeepLocalOrRemote(ctx: ConflictContext) {
  // Your dialog: keep this device vs accept remote head
  return 'remote' // | 'local' | 'cancel'
}`,
  },
  encryption: {
    lang: 'typescript',
    sdk: `const document = createDocumentAdapter({
  namespaceId,
  namespaceLabel: 'Demo workspace',
  contentType: 'application/vnd.senkronla-demo+json',
  encrypt: true,
  resolvePassword,
  exportDocument,
  importDocument,
})
// Payload becomes an ENV-ENC1 envelope — encrypted on the device.`,
    yours: `async function resolvePassword() {
  return userSyncPassword // prompt, secure storage, OS keychain…
}

function exportDocument() {
  return store.state
}

function importDocument(data: DemoDoc) {
  store.replace(data)
}`,
  },
  notifications: {
    lang: 'typescript',
    sdk: `const sync = await EsrSync.connect({
  relayUrl: 'https://sync.senkron.la/v1',
  storage: createLocalStorageAdapter(),
  document,
  notificationsEnabled: true, // WebSocket head_changed + poll fallback
  onRecoveryPhrase,
  onConflict,
})

sync.isNotificationConnected() // true when the live channel is up`,
    yours: `// Same handlers you wire in connect — notifications reuse your callbacks
const onRecoveryPhrase = ({ phrase }) => showRecoveryModal(phrase)
const onConflict = (ctx) => askKeepLocalOrRemote(ctx)`,
  },
}

interface UiCopy {
  header: {
    tagline: string
    join: string
    joinTitle: string
    joinDesc: string
    joinQrLabel: string
    joinOrManual: string
    joinNamespaceLabel: string
    joinNamespacePlaceholder: string
    joinCodeLabel: string
    joinCodePlaceholder: string
    joinInvalidPayload: string
    joinPasswordLabel: string
    joinPasswordPlaceholder: string
    joinPasswordHint: string
    joinPasswordRequired: string
    joinSubmit: string
    joinSuccess: string
    themeToggle: string
  }
  common: {
    next: string
    prev: string
    finish: string
    copy: string
    copied: string
    showPassword: string
    hidePassword: string
    run: string
    busy: string
    clear: string
    optional: string
    request: string
    response: string
    sdkLabel: string
    yoursLabel: string
    yoursHint: string
    stepNav: string
  }
  status: Record<string, string>
  intro: {
    zeroKnowledge: string
    zeroKnowledgeDesc: string
    offlineFirst: string
    offlineFirstDesc: string
    e2ee: string
    e2eeDesc: string
    liveUpdates: string
    liveUpdatesDesc: string
    start: string
    links: {
      website: string
      docs: string
      github: string
      donate: string
    }
    linksNav: string
  }
  install: {
    package: string
    version: string
    includes: string
    copyInstall: string
  }
  document: {
    workspaceLabel: string
    notePlaceholder: string
    addNote: string
    previewTitle: string
    emptyNotes: string
  }
  connect: {
    relayLabel: string
    appIdLabel: string
    appIdHint: string
    connect: string
    reconnect: string
    connected: string
    disconnected: string
    healthTitle: string
    appsEnabled: string
    appsDisabled: string
    appsUnknown: string
    appIdRequired: string
    registerInfo: string
    empty: string
    healthFailed: string
    persistEnable: string
    persistEnabled: string
    persistNote: string
  }
  namespace: {
    create: string
    namespaceId: string
    created: string
    createdYes: string
    createdNo: string
    empty: string
  }
  recovery: {
    empty: string
    saved: string
    warnTitle: string
    warn: string
    copyHint: string
    copyAll: string
    copyWord: string
    acknowledgedTitle: string
    acknowledged: string
    existingTitle: string
    existingNamespace: string
    unavailableTitle: string
    unavailable: string
  }
  sync: {
    run: string
    revision: string
    writtenAt: string
    sha: string
    size: string
    empty: string
  }
  pairing: {
    start: string
    code: string
    copyQrHint: string
    copyQrAria: string
    expires: string
    joinHint: string
    empty: string
  }
  syncData: {
    notePlaceholder: string
    push: string
    envelopeTitle: string
    envelopeTitleEncrypted: string
    opaqueTitle: string
    opaque: string
    opaqueEncrypted: string
    encryptionOn: string
    needsPassword: string
    empty: string
  }
  conflict: {
    simulate: string
    explainTitle: string
    explain: string
    empty: string
    modalTitle: string
    modalDesc: string
    localTitle: string
    remoteTitle: string
    keepLocal: string
    keepRemote: string
    cancel: string
    revision: string
    writtenAt: string
    device: string
  }
  encryption: {
    enable: string
    enabled: string
    passwordLabel: string
    passwordPlaceholder: string
    apply: string
    plaintextTitle: string
    encryptedTitle: string
    empty: string
    note: string
  }
  notifications: {
    enable: string
    enabled: string
    disabled: string
    wsState: string
    connected: string
    disconnected: string
    logTitle: string
    empty: string
    tip: string
  }
  completion: {
    eyebrow: string
    title: string
    subtitle: string
    bullets: string[]
    restart: string
    showAgent: string
    linksNav: string
    links: {
      website: string
      docs: string
      github: string
      donate: string
    }
  }
}

const STATUS_EN: Record<string, string> = {
  not_connected: 'not connected',
  disabled: 'disabled',
  idle: 'idle',
  syncing: 'syncing',
  pending_push: 'pending push',
  remote_pending: 'remote pending',
  conflict: 'conflict',
  error: 'error',
  offline: 'offline',
  ws_connected: 'live (websocket)',
}

const STATUS_TR: Record<string, string> = {
  not_connected: 'bağlı değil',
  disabled: 'devre dışı',
  idle: 'beklemede',
  syncing: 'senkronize ediliyor',
  pending_push: 'gönderim bekliyor',
  remote_pending: 'uzak değişiklik bekliyor',
  conflict: 'çakışma',
  error: 'hata',
  offline: 'çevrimdışı',
  ws_connected: 'canlı (websocket)',
}

const EN_STEPS: Record<StepId, StepCopy> = {
  intro: {
    eyebrow: 'Welcome',
    title: 'Sync any app in 12 steps',
    subtitle: 'A guided tour of the Senkronla client SDK, running for real against a relay.',
    body: [
      {
        kind: 'p',
        text: 'Senkronla is a **zero-knowledge** Envelope Sync Relay (ESR). Your app encrypts and owns the data model; the relay only stores opaque envelopes and coordinates revisions, devices and notifications.',
      },
      {
        kind: 'p',
        text: 'On the right you will build a tiny shared workspace. Open this page in **two tabs** (or pair a phone) to watch changes flow live.',
      },
    ],
    outputTitle: 'What you will build',
  },
  install: {
    eyebrow: 'Step 2 — Install',
    title: 'Add the SDK to your project',
    subtitle: 'One package gives you the facade, transport and crypto helpers.',
    body: [
      {
        kind: 'p',
        text: 'Install **@senkronla/client**. The **@senkronla/protocol** package (envelopes, crypto, identity) comes along automatically.',
      },
      {
        kind: 'p',
        text: 'It works in modern browsers and Node 22+, using `fetch`, `localStorage` and `WebSocket` where available.',
      },
    ],
    outputTitle: 'Package',
  },
  document: {
    eyebrow: 'Step 3 — Document',
    title: 'Describe your document',
    subtitle: 'A DocumentAdapter bridges your app state and the sync engine.',
    body: [
      {
        kind: 'p',
        text: 'Senkronla syncs **named JSON snapshots**. You provide `exportDocument` / `importDocument` and a `contentType`; the SDK handles serialization and revisions.',
      },
      {
        kind: 'p',
        text: 'Edit the workspace on the right and watch the JSON document take shape — this is exactly what `exportDocument()` returns.',
      },
    ],
    outputTitle: 'Live document',
  },
  connect: {
    eyebrow: 'Step 4 — Connect',
    title: 'Connect to a relay',
    subtitle: 'EsrSync.connect wires your adapter, storage and callbacks together.',
    body: [
      {
        kind: 'p',
        text: 'Point the SDK at a relay URL. When the relay has the **application registry** enabled (`apps.enabled`), you must also pass an **`appId`** — the demo uses `esr_app_demo`.',
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'How are apps registered?',
        text: 'Operators choose a mode: **operator_managed** (YAML seed + admin API) or **self_service**, where app owners register via the developer portal with domain/bundle verification.',
      },
      {
        kind: 'p',
        text: 'Pass **`persistRecoveryPhrase: true`** on `connect` if the recovery phrase may also be stored in your **StorageAdapter** (for example `localStorage`) after `onRecoveryPhrase` — so `recover()` can run on the same device later. Enable only when that fits your threat model.',
      },
    ],
    outputTitle: 'Connection',
  },
  namespace: {
    eyebrow: 'Step 5 — Namespace',
    title: 'Create the namespace',
    subtitle: 'A namespace is one isolated sync space — usually one per account.',
    body: [
      {
        kind: 'p',
        text: '`ensureNamespace()` registers this device, creates the namespace if needed, and performs the first push. The `namespaceId` is a UUID you persist before the first call.',
      },
      {
        kind: 'p',
        text: 'If a token already exists, the call is a no-op and simply returns `created: false`.',
      },
    ],
    outputTitle: 'Namespace',
  },
  recovery: {
    eyebrow: 'Step 6 — Recovery',
    title: 'Show the recovery phrase',
    subtitle: 'The only way back into a workspace from a fresh device.',
    body: [
      {
        kind: 'p',
        text: 'When a namespace is first created, `onRecoveryPhrase` fires with a phrase. Because the relay is zero-knowledge, **it cannot recover this for the user** — show it once and ask them to store it offline.',
      },
      {
        kind: 'p',
        text: 'Optionally pass **`persistRecoveryPhrase: true`** to `EsrSync.connect` to also save the phrase in your **StorageAdapter** (for example `localStorage`) so `recover()` can run on the same device later — only when that fits your security model.',
      },
    ],
    outputTitle: 'Recovery phrase',
  },
  sync: {
    eyebrow: 'Step 7 — Sync',
    title: 'Sync manually',
    subtitle: 'Pull the latest head, push pending local changes.',
    body: [
      {
        kind: 'p',
        text: '`sync()` runs a full pull/push cycle. The relay returns **metadata only** for the head — revision, hash and size — never decrypting your payload.',
      },
    ],
    outputTitle: 'Head metadata',
  },
  pairing: {
    eyebrow: 'Step 10 — Pairing',
    title: 'Pair another device',
    subtitle: 'Share a short-lived code (or QR) to add a second device.',
    body: [
      {
        kind: 'p',
        text: '`startPairing()` returns a `code`, a `qrPayload` and an expiry. On a second device, open this demo, tap **Join** in the header, paste the `qrPayload` (or enter the namespace ID and code) — it calls `joinPairing(code)` against that namespace.',
      },
      {
        kind: 'p',
        text: 'Pairing grants device access without ever sharing the recovery phrase.',
      },
    ],
    outputTitle: 'Pairing code',
  },
  encryption: {
    eyebrow: 'Step 8 — Encryption',
    title: 'Encrypt the envelope',
    subtitle: 'Opt into end-to-end encryption with a sync password.',
    body: [
      {
        kind: 'p',
        text: 'Set `encrypt: true` and provide `resolvePassword`. The SDK builds an **ENV-ENC1** envelope, encrypting the payload before it leaves the device.',
      },
      {
        kind: 'p',
        text: 'Turn on the toggle, choose a password, then press **Run** to reconnect and push the document with the new setting. The next step syncs further edits with the same adapter.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        title: 'Zero-knowledge',
        text: 'The relay stores ciphertext it cannot read. Lose the password and the data is unrecoverable — by design.',
      },
    ],
    outputTitle: 'Encrypted vs plaintext',
  },
  syncData: {
    eyebrow: 'Step 9 — Envelope',
    title: 'Sync real data',
    subtitle: 'See the exact ESR-DOC1 envelope that leaves the device.',
    body: [
      {
        kind: 'p',
        text: 'After every local edit call **`notifyLocalChange()`** — the SDK debounces and pushes on its own. **`sync()` is optional** (step 7); here the button also runs it so you can inspect the envelope immediately.',
      },
      {
        kind: 'p',
        text: 'Add a note and sync. The panel shows the **ESR-DOC1** envelope the relay receives — metadata plus an opaque `payload`.',
      },
      {
        kind: 'p',
        text: 'If you enabled encryption in the previous step, the payload is an **ENV-ENC1** blob; otherwise it is **ENV-RAW1**. The relay never interprets either.',
      },
    ],
    outputTitle: 'ESR-DOC1 envelope',
  },
  conflict: {
    eyebrow: 'Step 11 — Conflict',
    title: 'Resolve a conflict',
    subtitle: 'Two devices, one head — your app decides the winner.',
    body: [
      {
        kind: 'p',
        text: 'When local and remote revisions diverge, `onConflict` is called with both revisions and the remote metadata. Return **`local`**, **`remote`** or **`cancel`**.',
      },
      {
        kind: 'p',
        text: 'Press the button to simulate a remote write that conflicts with a local edit.',
      },
    ],
    outputTitle: 'Conflict resolution',
  },
  notifications: {
    eyebrow: 'Step 12 — Notifications',
    title: 'Enable live notifications',
    subtitle: 'Push-to-pull updates over WebSocket, with a poll fallback.',
    body: [
      {
        kind: 'p',
        text: 'Set `notificationsEnabled: true`. When another device writes, the relay sends a metadata-only **`head_changed`** event and the SDK pulls automatically.',
      },
      {
        kind: 'p',
        text: 'Open a second tab and edit there — new revisions appear in the log below.',
      },
    ],
    outputTitle: 'Live channel',
  },
}

const TR_STEPS: Record<StepId, StepCopy> = {
  intro: {
    eyebrow: 'Hoş geldin',
    title: '12 adımda her uygulamayı senkronla',
    subtitle: 'Senkronla istemci SDK’sının, gerçek bir relay üzerinde çalışan rehberli turu.',
    body: [
      {
        kind: 'p',
        text: 'Senkronla, **sıfır-bilgi (zero-knowledge)** bir Zarf Senkron Relay’idir (ESR). Veriyi uygulaman şifreler ve sahiplenir; relay yalnızca opak zarfları saklar, revizyonları, cihazları ve bildirimleri koordine eder.',
      },
      {
        kind: 'p',
        text: 'Sağda küçük, paylaşımlı bir çalışma alanı kuracaksın. Bu sayfayı **iki sekmede** aç (veya bir telefon eşle) ve değişikliklerin canlı aktığını izle.',
      },
    ],
    outputTitle: 'Ne inşa edeceğiz',
  },
  install: {
    eyebrow: '2. Adım — Kurulum',
    title: 'SDK’yı projene ekle',
    subtitle: 'Tek paket; facade, taşıma katmanı ve kripto yardımcılarını verir.',
    body: [
      {
        kind: 'p',
        text: '**@senkronla/client** paketini kur. Zarf/kripto/kimlik içeren **@senkronla/protocol** otomatik olarak gelir.',
      },
      {
        kind: 'p',
        text: 'Modern tarayıcılarda ve Node 22+’da; `fetch`, `localStorage` ve `WebSocket` varsa onları kullanarak çalışır.',
      },
    ],
    outputTitle: 'Paket',
  },
  document: {
    eyebrow: '3. Adım — Döküman',
    title: 'Dökümanını tanımla',
    subtitle: 'DocumentAdapter, uygulama durumunla senkron motoru arasındaki köprüdür.',
    body: [
      {
        kind: 'p',
        text: 'Senkronla **adlandırılmış JSON anlık görüntülerini** senkronlar. Sen `exportDocument` / `importDocument` ve bir `contentType` verirsin; serileştirme ve revizyonları SDK halleder.',
      },
      {
        kind: 'p',
        text: 'Sağdaki çalışma alanını düzenle ve JSON dökümanının şekillenişini izle — `exportDocument()` tam olarak bunu döndürür.',
      },
    ],
    outputTitle: 'Canlı döküman',
  },
  connect: {
    eyebrow: '4. Adım — Bağlantı',
    title: 'Bir relay’e bağlan',
    subtitle: 'EsrSync.connect; adapter, depolama ve geri çağrıları birbirine bağlar.',
    body: [
      {
        kind: 'p',
        text: 'SDK’yı bir relay URL’sine yönlendir. Relay’de **uygulama kaydı** açıksa (`apps.enabled`), ayrıca bir **`appId`** geçmen gerekir — demo `esr_app_demo` kullanır.',
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'Uygulamalar nasıl kaydedilir?',
        text: 'Operatör bir mod seçer: **operator_managed** (YAML tohum + admin API) ya da **self_service** — uygulama sahipleri geliştirici portalından alan/bundle doğrulamasıyla kaydolur.',
      },
      {
        kind: 'p',
        text: 'Kurtarma ifadesinin `onRecoveryPhrase` sonrasında **StorageAdapter**’ında da (ör. `localStorage`) saklanmasına izin veriyorsan `connect`’e **`persistRecoveryPhrase: true`** ekle — aynı cihazda sonra `recover()` için. Yalnızca tehdit modelin buna uygunsa aç.',
      },
    ],
    outputTitle: 'Bağlantı',
  },
  namespace: {
    eyebrow: '5. Adım — Namespace',
    title: 'Namespace’i oluştur',
    subtitle: 'Namespace, izole tek bir senkron alanıdır — genelde hesap başına bir tane.',
    body: [
      {
        kind: 'p',
        text: '`ensureNamespace()` bu cihazı kaydeder, gerekiyorsa namespace’i oluşturur ve ilk push’u yapar. `namespaceId`, ilk çağrıdan önce sakladığın bir UUID’dir.',
      },
      {
        kind: 'p',
        text: 'Zaten bir token varsa çağrı işlem yapmaz ve yalnızca `created: false` döner.',
      },
    ],
    outputTitle: 'Namespace',
  },
  recovery: {
    eyebrow: '6. Adım — Kurtarma',
    title: 'Kurtarma ifadesini göster',
    subtitle: 'Yeni bir cihazdan çalışma alanına dönmenin tek yolu.',
    body: [
      {
        kind: 'p',
        text: 'Namespace ilk oluşturulduğunda `onRecoveryPhrase` bir ifadeyle tetiklenir. Relay sıfır-bilgi olduğundan **bunu kullanıcı adına kurtaramaz** — bir kez göster ve çevrimdışı saklamasını iste.',
      },
      {
        kind: 'p',
        text: 'İsteğe bağlı olarak `EsrSync.connect`’e **`persistRecoveryPhrase: true`** vererek ifadeyi **StorageAdapter**’ında (ör. `localStorage`) saklayabilirsin; aynı cihazda sonra `recover()` çalıştırmak için — yalnızca tehdit modelin buna uygunsa.',
      },
    ],
    outputTitle: 'Kurtarma ifadesi',
  },
  sync: {
    eyebrow: '7. Adım — Senkron',
    title: 'Elle senkronla',
    subtitle: 'En güncel head’i çek, bekleyen yerel değişiklikleri gönder.',
    body: [
      {
        kind: 'p',
        text: '`sync()` tam bir çek/gönder döngüsü çalıştırır. Relay, head için **yalnızca meta veri** döndürür — revizyon, özet ve boyut — payload’u asla çözmez.',
      },
    ],
    outputTitle: 'Head meta verisi',
  },
  pairing: {
    eyebrow: '10. Adım — Eşleştirme',
    title: 'Başka bir cihaz eşle',
    subtitle: 'İkinci cihazı eklemek için kısa ömürlü bir kod (veya QR) paylaş.',
    body: [
      {
        kind: 'p',
        text: '`startPairing()`; bir `code`, bir `qrPayload` ve son kullanma döndürür. İkinci cihazda bu demoyu aç, başlıktaki **Katıl**’a dokun, `qrPayload`’u yapıştır (veya namespace ID ile kodu gir) — o namespace’e karşı `joinPairing(code)` çağrılır.',
      },
      {
        kind: 'p',
        text: 'Eşleştirme, kurtarma ifadesi hiç paylaşılmadan cihaz erişimi verir.',
      },
    ],
    outputTitle: 'Eşleştirme kodu',
  },
  encryption: {
    eyebrow: '8. Adım — Şifreleme',
    title: 'Zarfı şifrele',
    subtitle: 'Bir senkron parolasıyla uçtan uca şifrelemeyi aç.',
    body: [
      {
        kind: 'p',
        text: '`encrypt: true` ayarla ve `resolvePassword` ver. SDK bir **ENV-ENC1** zarfı kurar; payload’u cihazdan çıkmadan önce şifreler.',
      },
      {
        kind: 'p',
        text: 'Toggle’ı aç, parolayı seç, ardından **Çalıştır** ile yeniden bağlanıp belgeyi yeni ayarla relay’e gönder. Sonraki adım aynı adapter ile düzenlemeleri senkronlar.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        title: 'Sıfır-bilgi',
        text: 'Relay, okuyamadığı şifreli metni saklar. Parolayı kaybedersen veri geri getirilemez — tasarımı gereği.',
      },
    ],
    outputTitle: 'Şifreli vs düz metin',
  },
  syncData: {
    eyebrow: '9. Adım — Zarf',
    title: 'Gerçek veriyi senkronla',
    subtitle: 'Cihazdan çıkan tam ESR-DOC1 zarfını gör.',
    body: [
      {
        kind: 'p',
        text: 'Her yerel düzenlemeden sonra **`notifyLocalChange()`** çağır — SDK debounce ile kendisi push eder. **`sync()` zorunlu değil** (7. adım); burada düğme anında zarfı göstermek için onu da çalıştırır.',
      },
      {
        kind: 'p',
        text: 'Bir not ekle ve senkronla. Panel, relay’in aldığı **ESR-DOC1** zarfını gösterir — meta veri ve opak bir `payload`.',
      },
      {
        kind: 'p',
        text: 'Önceki adımda şifrelemeyi açtıysan payload bir **ENV-ENC1** blob’udur; aksi halde **ENV-RAW1**. Relay ikisini de asla yorumlamaz.',
      },
    ],
    outputTitle: 'ESR-DOC1 zarfı',
  },
  conflict: {
    eyebrow: '11. Adım — Çakışma',
    title: 'Bir çakışmayı çöz',
    subtitle: 'İki cihaz, tek head — kazananı uygulaman seçer.',
    body: [
      {
        kind: 'p',
        text: 'Yerel ve uzak revizyonlar ayrıştığında `onConflict`, iki revizyon ve uzak meta veriyle çağrılır. **`local`**, **`remote`** ya da **`cancel`** döndür.',
      },
      {
        kind: 'p',
        text: 'Yerel bir düzenlemeyle çakışan uzak bir yazımı simüle etmek için düğmeye bas.',
      },
    ],
    outputTitle: 'Çakışma çözümü',
  },
  notifications: {
    eyebrow: '12. Adım — Bildirimler',
    title: 'Canlı bildirimleri aç',
    subtitle: 'WebSocket üzerinden it-çek güncellemeleri, poll yedeğiyle.',
    body: [
      {
        kind: 'p',
        text: '`notificationsEnabled: true` ayarla. Başka bir cihaz yazdığında relay yalnızca meta veri içeren bir **`head_changed`** olayı gönderir ve SDK otomatik çeker.',
      },
      {
        kind: 'p',
        text: 'İkinci bir sekme aç ve orada düzenle — yeni revizyonlar aşağıdaki günlükte belirir.',
      },
    ],
    outputTitle: 'Canlı kanal',
  },
}

const EN: { ui: UiCopy; steps: Record<StepId, StepCopy> } = {
  steps: EN_STEPS,
  ui: {
    header: {
      tagline: 'SDK Tutorial',
      join: 'Join',
      joinTitle: 'Join from another device',
      joinDesc:
        'Paste the QR payload from step 10, or enter the workspace namespace ID and 6-digit pairing code.',
      joinQrLabel: 'QR payload',
      joinOrManual: 'Or enter manually',
      joinNamespaceLabel: 'Namespace ID',
      joinNamespacePlaceholder: '550e8400-e29b-41d4-a716-446655440000',
      joinCodeLabel: 'Pairing code',
      joinCodePlaceholder: '482913',
      joinInvalidPayload: 'Could not parse QR payload — check the esr://pair/v1/… format.',
      joinPasswordLabel: 'Sync password',
      joinPasswordPlaceholder: 'Same password the host set in step 8',
      joinPasswordHint: 'Required when the workspace uses envelope encryption (ENV-ENC1).',
      joinPasswordRequired:
        'This workspace is encrypted. Enter the sync password below and try again.',
      joinSubmit: 'Join workspace',
      joinSuccess: 'Device paired and synced.',
      themeToggle: 'Toggle theme',
    },
    common: {
      next: 'Next',
      prev: 'Back',
      finish: 'Finish',
      copy: 'Copy',
      copied: 'Copied',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      run: 'Run',
      busy: 'Working…',
      clear: 'Reset',
      optional: 'optional',
      request: 'Request',
      response: 'Response',
      sdkLabel: 'SDK',
      yoursLabel: 'Your app',
      yoursHint:
        'You implement the code below in your application. The SDK calls these adapters and callbacks — they are not part of @senkronla/client.',
      stepNav: 'Tutorial steps',
    },
    status: STATUS_EN,
    intro: {
      zeroKnowledge: 'Zero-knowledge',
      zeroKnowledgeDesc: 'The relay stores opaque envelopes and never reads your payload.',
      offlineFirst: 'Offline-first',
      offlineFirstDesc: 'Edit offline; the SDK queues and pushes when back online.',
      e2ee: 'Pairing & recovery',
      e2eeDesc: 'Add devices with codes; recover with an offline phrase.',
      liveUpdates: 'Live notifications',
      liveUpdatesDesc: 'Another device writes; WebSocket tells the SDK to pull automatically.',
      start: 'Start the tour',
      links: {
        website: 'senkron.la',
        docs: 'Guides',
        github: 'GitHub',
        donate: 'Donate',
      },
      linksNav: 'Senkronla links',
    },
    install: {
      package: '@senkronla/client',
      version: 'version',
      includes: 'Includes @senkronla/protocol',
      copyInstall: 'Copy install command',
    },
    document: {
      workspaceLabel: 'Workspace name',
      notePlaceholder: 'Add a note and press Enter',
      addNote: 'Add',
      previewTitle: 'exportDocument()',
      emptyNotes: 'No notes yet — add one above.',
    },
    connect: {
      relayLabel: 'Relay URL',
      appIdLabel: 'App ID',
      appIdHint: 'Sent as X-ESR-App-Id when apps.enabled',
      connect: 'Connect',
      reconnect: 'Reconnect',
      connected: 'Connected',
      disconnected: 'Not connected',
      healthTitle: 'Relay health',
      appsEnabled: 'apps.enabled — appId is required',
      appsDisabled: 'apps.enabled is off — appId optional',
      appsUnknown: 'Click Connect to read /health and open the SDK session.',
      appIdRequired: 'This relay requires an appId.',
      registerInfo: 'Register apps via operator config or the developer portal.',
      empty: 'Click Connect to fetch the live /health response.',
      healthFailed:
        'Could not reach the relay — check the URL and that GET /health allows this origin (CORS).',
      persistEnable: 'Persist recovery phrase',
      persistEnabled: 'persistRecoveryPhrase: true',
      persistNote: 'When the namespace is created, also write the recovery phrase to your StorageAdapter (e.g. localStorage).',
    },
    namespace: {
      create: 'Create namespace',
      namespaceId: 'namespaceId',
      created: 'created',
      createdYes: 'newly created',
      createdNo: 'already existed',
      empty: 'Run ensureNamespace() to register this device.',
    },
    recovery: {
      empty: 'Create the namespace (step 5) to receive a recovery phrase.',
      saved: 'I stored it safely',
      warnTitle: 'Store this offline',
      warn: 'This phrase is shown once and cannot be retrieved later.',
      copyHint: 'Click a word to copy it.',
      copyAll: 'Copy full phrase',
      copyWord: 'Copy word',
      acknowledgedTitle: 'Phrase stored',
      acknowledged:
        'You confirmed the recovery phrase is saved safely. The SDK will not show it again on this device. Use your offline backup, or call recover() if you enabled persistRecoveryPhrase.',
      existingTitle: 'Namespace already registered',
      existingNamespace:
        'This namespace was already created on this or another device. The recovery phrase is shown only once — at first creation — and the relay cannot retrieve it. Use your offline backup or pairing to add devices.',
      unavailableTitle: 'Phrase no longer in memory',
      unavailable:
        'The namespace exists but the recovery phrase is not kept in this demo session. If you already saved it, you are set; otherwise you cannot view it again here.',
    },
    sync: {
      run: 'Sync now',
      revision: 'revision',
      writtenAt: 'writtenAt',
      sha: 'contentSha256',
      size: 'sizeBytes',
      empty: 'Run sync() to read the current head.',
    },
    pairing: {
      start: 'Start pairing',
      code: 'Pairing code',
      copyQrHint: 'Click the QR to copy the payload',
      copyQrAria: 'Copy QR payload',
      expires: 'Expires',
      joinHint: 'On the other device, use Join in the header and paste the QR payload.',
      empty: 'Generate a code to add a second device.',
    },
    syncData: {
      notePlaceholder: 'New note to sync',
      push: 'Add & sync',
      envelopeTitle: 'Sent to relay (ENV-RAW1)',
      envelopeTitleEncrypted: 'Sent to relay (ENV-ENC1)',
      opaqueTitle: 'Opaque payload',
      opaque: 'The relay verifies the hash and size but never reads the payload.',
      opaqueEncrypted: 'Payload is ENV-ENC1 ciphertext — the relay verifies the hash and size but cannot decrypt.',
      encryptionOn: 'Encryption is on from the previous step.',
      needsPassword: 'Set a sync password on the previous step to encrypt.',
      empty: 'Add a note and sync to inspect the envelope.',
    },
    conflict: {
      simulate: 'Simulate a conflict',
      explainTitle: 'How it works',
      explain: 'A local edit and a remote write target the same head; onConflict picks the winner.',
      empty: 'Trigger a conflict to see the resolution flow.',
      modalTitle: 'Sync conflict',
      modalDesc: 'Local and remote versions diverged. Which one should win?',
      localTitle: 'Local',
      remoteTitle: 'Remote',
      keepLocal: 'Keep local',
      keepRemote: 'Keep remote',
      cancel: 'Cancel',
      revision: 'revision',
      writtenAt: 'writtenAt',
      device: 'device',
    },
    encryption: {
      enable: 'Encrypt the envelope',
      enabled: 'Encryption is on',
      passwordLabel: 'Sync password',
      passwordPlaceholder: 'Choose a sync password',
      apply: 'Apply & reconnect',
      plaintextTitle: 'ENV-RAW1 (plaintext)',
      encryptedTitle: 'ENV-ENC1 (encrypted)',
      empty: 'Set a password and apply to compare payloads.',
      note: 'Payload is encrypted on the device before upload.',
    },
    notifications: {
      enable: 'Enable live notifications',
      enabled: 'Notifications are on',
      disabled: 'off',
      wsState: 'WebSocket',
      connected: 'connected',
      disconnected: 'connecting / poll',
      logTitle: 'Notification log',
      empty: 'Enable notifications, then edit in a second tab.',
      tip: 'WebSocket carries metadata only; documents always travel over HTTP.',
    },
    completion: {
      eyebrow: 'Done',
      title: 'You completed the SDK tour',
      subtitle:
        'Your demo workspace is live on the relay — take these patterns into your own app.',
      bullets: [
        'Connect to a relay and sync JSON documents with push and pull',
        'Pair devices, recover with a phrase, and resolve conflicts in your UI',
        'Optional envelope encryption keeps payloads opaque on the relay',
        'WebSocket notifications keep tabs and devices in step',
      ],
      restart: 'Start over',
      showAgent: 'Show to your agent',
      linksNav: 'Next steps',
      links: {
        website: 'senkron.la',
        docs: 'Guides',
        github: 'GitHub',
        donate: 'Donate',
      },
    },
  },
}

const TR: { ui: UiCopy; steps: Record<StepId, StepCopy> } = {
  steps: TR_STEPS,
  ui: {
    header: {
      tagline: 'SDK Öğretici',
      join: 'Katıl',
      joinTitle: 'Başka bir cihazdan katıl',
      joinDesc:
        '10. adımdaki QR payload’u yapıştır veya çalışma alanı namespace ID’si ile 6 haneli eşleştirme kodunu gir.',
      joinQrLabel: 'QR payload',
      joinOrManual: 'Ya da elle gir',
      joinNamespaceLabel: 'Namespace ID',
      joinNamespacePlaceholder: '550e8400-e29b-41d4-a716-446655440000',
      joinCodeLabel: 'Eşleştirme kodu',
      joinCodePlaceholder: '482913',
      joinInvalidPayload: 'QR payload okunamadı — esr://pair/v1/… biçimini kontrol et.',
      joinPasswordLabel: 'Senkron parolası',
      joinPasswordPlaceholder: 'Ana cihazda 8. adımda belirlediğin parola',
      joinPasswordHint: 'Çalışma alanı zarf şifrelemesi (ENV-ENC1) kullanıyorsa zorunlu.',
      joinPasswordRequired:
        'Bu çalışma alanı şifreli. Senkron parolasını gir ve tekrar dene.',
      joinSubmit: 'Çalışma alanına katıl',
      joinSuccess: 'Cihaz eşlendi ve senkronize edildi.',
      themeToggle: 'Temayı değiştir',
    },
    common: {
      next: 'İleri',
      prev: 'Geri',
      finish: 'Bitir',
      copy: 'Kopyala',
      copied: 'Kopyalandı',
      showPassword: 'Parolayı göster',
      hidePassword: 'Parolayı gizle',
      run: 'Çalıştır',
      busy: 'Çalışıyor…',
      clear: 'Sıfırla',
      optional: 'opsiyonel',
      request: 'İstek',
      response: 'Yanıt',
      sdkLabel: 'SDK',
      yoursLabel: 'Uygulamanız',
      yoursHint:
        'Aşağıdaki kodu uygulamanızda siz yazarsınız. SDK bu adapter ve callback’leri çağırır — @senkronla/client paketinin parçası değildir.',
      stepNav: 'Öğretici adımları',
    },
    status: STATUS_TR,
    intro: {
      zeroKnowledge: 'Sıfır-bilgi',
      zeroKnowledgeDesc: 'Relay opak zarfları saklar ve payload’unu asla okumaz.',
      offlineFirst: 'Önce-çevrimdışı',
      offlineFirstDesc: 'Çevrimdışı düzenle; SDK kuyruğa alır ve çevrimiçi olunca gönderir.',
      e2ee: 'Eşleştirme ve kurtarma',
      e2eeDesc: 'Kodlarla cihaz ekle; çevrimdışı bir ifadeyle kurtar.',
      liveUpdates: 'Canlı bildirimler',
      liveUpdatesDesc: 'Başka cihaz yazdığında WebSocket uyarır; SDK otomatik çeker.',
      start: 'Tura başla',
      links: {
        website: 'senkron.la',
        docs: 'Rehberler',
        github: 'GitHub',
        donate: 'Bağış Yap',
      },
      linksNav: 'Senkronla bağlantıları',
    },
    install: {
      package: '@senkronla/client',
      version: 'sürüm',
      includes: '@senkronla/protocol dahil',
      copyInstall: 'Kurulum komutunu kopyala',
    },
    document: {
      workspaceLabel: 'Çalışma alanı adı',
      notePlaceholder: 'Bir not ekle ve Enter’a bas',
      addNote: 'Ekle',
      previewTitle: 'exportDocument()',
      emptyNotes: 'Henüz not yok — yukarıdan ekle.',
    },
    connect: {
      relayLabel: 'Relay URL',
      appIdLabel: 'Uygulama Kimliği (App ID)',
      appIdHint: 'apps.enabled iken X-ESR-App-Id olarak gönderilir',
      connect: 'Bağlan',
      reconnect: 'Yeniden bağlan',
      connected: 'Bağlandı',
      disconnected: 'Bağlı değil',
      healthTitle: 'Relay sağlığı',
      appsEnabled: 'apps.enabled — appId zorunlu',
      appsDisabled: 'apps.enabled kapalı — appId opsiyonel',
      appsUnknown: 'Bağlan’a tıklayınca /health okunur ve SDK oturumu açılır.',
      appIdRequired: 'Bu relay bir appId gerektiriyor.',
      registerInfo: 'Uygulamalar operatör yapılandırmasıyla veya geliştirici portalından kaydedilir.',
      empty: 'Canlı /health yanıtı için Bağlan’a tıkla.',
      healthFailed:
        'Relay’e ulaşılamadı — URL’yi kontrol edin; GET /health bu kökenden CORS ile açık olmalı.',
      persistEnable: 'Kurtarma ifadesini sakla',
      persistEnabled: 'persistRecoveryPhrase: true',
      persistNote: 'Namespace oluşturulunca kurtarma ifadesi StorageAdapter’ına da yazılır (ör. localStorage).',
    },
    namespace: {
      create: 'Namespace oluştur',
      namespaceId: 'namespaceId',
      created: 'oluşturuldu',
      createdYes: 'yeni oluşturuldu',
      createdNo: 'zaten vardı',
      empty: 'Bu cihazı kaydetmek için ensureNamespace() çalıştır.',
    },
    recovery: {
      empty: 'Kurtarma ifadesi almak için namespace’i oluştur (5. adım).',
      saved: 'Güvenle sakladım',
      warnTitle: 'Bunu çevrimdışı sakla',
      warn: 'Bu ifade yalnızca bir kez gösterilir ve sonradan geri alınamaz.',
      copyHint: 'Kelimeyi kopyalamak için tıkla.',
      copyAll: 'Tüm ifadeyi kopyala',
      copyWord: 'Kelimeyi kopyala',
      acknowledgedTitle: 'İfade saklandı',
      acknowledged:
        'Kurtarma ifadesini güvenle sakladığını onayladın. SDK bu cihazda bir daha göstermez. Çevrimdışı yedeğini kullan veya persistRecoveryPhrase açıksa recover() çağır.',
      existingTitle: 'Namespace zaten kayıtlı',
      existingNamespace:
        'Bu namespace bu veya başka bir cihazda daha önce oluşturulmuş. Kurtarma ifadesi yalnızca ilk oluşturmada bir kez gösterilir; relay geri getiremez. Çevrimdışı yedeğini kullan veya yeni cihazlar için eşleştirmeyi tercih et.',
      unavailableTitle: 'Ifade bellekte yok',
      unavailable:
        'Namespace var ama kurtarma ifadesi bu demo oturumunda tutulmuyor. Zaten kaydettiysen sorun yok; kaydetmediysen burada tekrar gösterilemez.',
    },
    sync: {
      run: 'Şimdi senkronla',
      revision: 'revizyon',
      writtenAt: 'yazılma',
      sha: 'contentSha256',
      size: 'boyut (bayt)',
      empty: 'Güncel head’i okumak için sync() çalıştır.',
    },
    pairing: {
      start: 'Eşleştirmeyi başlat',
      code: 'Eşleştirme kodu',
      copyQrHint: 'Payload’u kopyalamak için QR’a tıkla',
      copyQrAria: 'QR payload’u kopyala',
      expires: 'Son kullanma',
      joinHint: 'Diğer cihazda başlıktaki Katıl’ı aç ve QR payload’u yapıştır.',
      empty: 'İkinci cihaz eklemek için kod üret.',
    },
    syncData: {
      notePlaceholder: 'Senkronlanacak yeni not',
      push: 'Ekle ve senkronla',
      envelopeTitle: 'Relay’e gönderilen (ENV-RAW1)',
      envelopeTitleEncrypted: 'Relay’e gönderilen (ENV-ENC1)',
      opaqueTitle: 'Opak payload',
      opaque: 'Relay özeti ve boyutu doğrular ama payload’u asla okumaz.',
      opaqueEncrypted:
        'Payload ENV-ENC1 şifreli metindir — relay özeti ve boyutu doğrular ama çözemez.',
      encryptionOn: 'Önceki adımdan şifreleme açık.',
      needsPassword: 'Şifrelemek için önceki adımda bir senkron parolası gir.',
      empty: 'Zarfı incelemek için not ekleyip senkronla.',
    },
    conflict: {
      simulate: 'Çakışma simüle et',
      explainTitle: 'Nasıl çalışır',
      explain: 'Yerel bir düzenleme ile uzak bir yazım aynı head’i hedefler; onConflict kazananı seçer.',
      empty: 'Çözüm akışını görmek için bir çakışma tetikle.',
      modalTitle: 'Senkron çakışması',
      modalDesc: 'Yerel ve uzak sürümler ayrıştı. Hangisi kazansın?',
      localTitle: 'Yerel',
      remoteTitle: 'Uzak',
      keepLocal: 'Yereli tut',
      keepRemote: 'Uzağı tut',
      cancel: 'İptal',
      revision: 'revizyon',
      writtenAt: 'yazılma',
      device: 'cihaz',
    },
    encryption: {
      enable: 'Zarfı şifrele',
      enabled: 'Şifreleme açık',
      passwordLabel: 'Senkron parolası',
      passwordPlaceholder: 'Bir senkron parolası seç',
      apply: 'Uygula ve yeniden bağlan',
      plaintextTitle: 'ENV-RAW1 (düz metin)',
      encryptedTitle: 'ENV-ENC1 (şifreli)',
      empty: 'Payload’ları karşılaştırmak için parola gir ve uygula.',
      note: 'Payload, yüklemeden önce cihazda şifrelenir.',
    },
    notifications: {
      enable: 'Canlı bildirimleri aç',
      enabled: 'Bildirimler açık',
      disabled: 'kapalı',
      wsState: 'WebSocket',
      connected: 'bağlı',
      disconnected: 'bağlanıyor / poll',
      logTitle: 'Bildirim günlüğü',
      empty: 'Bildirimleri aç, sonra ikinci bir sekmede düzenle.',
      tip: 'WebSocket yalnızca meta veri taşır; dökümanlar her zaman HTTP üzerinden gider.',
    },
    completion: {
      eyebrow: 'Tamamlandı',
      title: 'SDK turunu tamamladın',
      subtitle:
        'Demo çalışma alanın relay üzerinde canlı — bu kalıpları kendi uygulamana taşı.',
      bullets: [
        'Bir relay’e bağlan; JSON dökümanlarını push ve pull ile senkronla',
        'Cihaz eşle, kurtarma ifadesiyle dön, çakışmaları arayüzünde çöz',
        'İsteğe bağlı zarf şifrelemesi payload’u relay’de opak tutar',
        'WebSocket bildirimleri sekmeleri ve cihazları uyumlu tutar',
      ],
      restart: 'Baştan başla',
      showAgent: 'Ajanına göster',
      linksNav: 'Sonraki adımlar',
      links: {
        website: 'senkron.la',
        docs: 'Rehberler',
        github: 'GitHub',
        donate: 'Bağış Yap',
      },
    },
  },
}

export const MESSAGES: Record<Locale, { ui: UiCopy; steps: Record<StepId, StepCopy> }> = {
  en: EN,
  tr: TR,
}

export function detectLocale(): Locale {
  if (typeof navigator !== 'undefined') {
    const lang = (navigator.language || '').toLowerCase()
    if (lang.startsWith('tr')) {
      return 'tr'
    }
  }
  return 'en'
}

export type UiMessages = UiCopy
