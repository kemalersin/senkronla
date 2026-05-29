/**
 * Multi-document sync example (ESR spec v1.2).
 *
 * Prerequisites: relay running (e.g. docker compose), Node 22+.
 *
 *   ESR_RELAY_URL=http://localhost:8080/v1 pnpm example:multi-document
 */
import { randomUUID } from 'node:crypto'
import {
  createDocumentAdapter,
  createMemoryStorageAdapter,
  EsrSync,
} from '../packages/client/src/index.js'

const relayUrl = process.env.ESR_RELAY_URL ?? 'http://localhost:8080/v1'
const namespaceId = process.env.ESR_NAMESPACE_ID ?? randomUUID()

type AppState = { notes: string[] }
type SettingsState = { theme: 'light' | 'dark' }

async function main(): Promise<void> {
  let appState: AppState = { notes: ['Welcome'] }
  let settings: SettingsState = { theme: 'light' }

  const storage = createMemoryStorageAdapter('multi-doc-example')

  const sync = await EsrSync.connect({
    relayUrl,
    storage,
    notificationsEnabled: false,
    documents: [
      {
        adapter: createDocumentAdapter({
          namespaceId,
          namespaceLabel: 'Multi-doc demo',
          contentType: 'application/vnd.example.app+json',
          exportDocument: async () => appState,
          importDocument: async (json) => {
            appState = JSON.parse(json) as AppState
          },
        }),
      },
      {
        documentId: 'settings',
        adapter: createDocumentAdapter({
          namespaceId,
          namespaceLabel: 'Multi-doc demo',
          contentType: 'application/vnd.example.settings+json',
          exportDocument: async () => settings,
          importDocument: async (json) => {
            settings = JSON.parse(json) as SettingsState
          },
        }),
      },
    ],
    onRecoveryPhrase: async ({ phrase }) => {
      console.log('\n[recovery] Save this phrase:\n', phrase, '\n')
    },
    onConflict: async (ctx) => {
      console.log(`[conflict] document=${ctx.documentId} remote=${ctx.remoteRevision}`)
      return 'remote'
    },
    onDocumentStatusChange: (documentId, status) => {
      console.log(`[status] ${documentId} → ${status}`)
    },
  })

  console.log('Namespace:', namespaceId)
  console.log('Documents:', sync.documentIds.join(', '))

  const ensured = await sync.ensureNamespace({ namespaceLabel: 'Multi-doc demo' })
  console.log('Namespace created:', ensured.created)

  appState = { notes: ['Welcome', 'Second note'] }
  sync.notifyLocalChange('primary')
  await sync.flushPush('primary')
  console.log('Pushed primary:', appState)

  settings = { theme: 'dark' }
  sync.notifyLocalChange('settings')
  await sync.sync('settings')
  console.log('Synced settings:', settings)

  const listed = await sync.relay.listDocuments(namespaceId)
  console.log(
    'Remote heads:',
    listed.documents.map((d) => `${d.documentId}@${d.revision}`).join(', '),
  )

  console.log('\nDone.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
