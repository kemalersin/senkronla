import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { randomUUID } from 'node:crypto'
import { sha256Hex } from '@senkronla/protocol'
import { ulid } from 'ulid'
import { buildApp } from '../app.js'
import { loadConfig } from '../config/load-config.js'
import { createPool } from '../db/pool.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

for (const envFile of ['.env']) {
  const envPath = resolve(repoRoot, envFile)
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath })
  }
}

function buildEnvelope(
  namespaceId: string,
  revision: string,
  deviceId: string,
  data = '{"hello":"world"}',
) {
  const payload = JSON.stringify({ magic: 'ENV-RAW1', data })

  return {
    magic: 'ESR-DOC1',
    schemaVersion: 1,
    namespaceId,
    namespaceLabel: 'Smoke',
    documentId: 'primary',
    revision,
    deviceId,
    writtenAt: new Date().toISOString(),
    contentType: 'application/vnd.test+json',
    contentMagic: 'ENV-RAW1',
    contentSha256: sha256Hex(payload),
    payload,
  }
}

async function main() {
  const config = loadConfig()
  const db = createPool(config)
  const app = await buildApp({ config, db })
  await app.ready()

  try {
    const namespaceId = randomUUID()
    const clientDeviceId = randomUUID()

    const create = await app.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Smoke',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId,
      },
    })

    if (create.statusCode !== 201) {
      throw new Error(`create failed: ${create.statusCode} ${create.body}`)
    }

    const { deviceToken } = create.json<{ deviceToken: string }>()
    const auth = { authorization: `Bearer ${deviceToken}` }
    const rev1 = ulid()

    const push1 = await app.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: auth,
      payload: { envelope: buildEnvelope(namespaceId, rev1, clientDeviceId) },
    })

    if (push1.statusCode !== 201) {
      throw new Error(`push1 failed: ${push1.statusCode} ${push1.body}`)
    }

    const meta = await app.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}/documents/primary/head/meta`,
      headers: auth,
    })

    if (meta.statusCode !== 200 || meta.json<{ revision: string }>().revision !== rev1) {
      throw new Error(`meta failed: ${meta.statusCode} ${meta.body}`)
    }

    const head = await app.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}/documents/primary/head`,
      headers: auth,
    })

    if (head.statusCode !== 200 || head.json<{ revision: string }>().revision !== rev1) {
      throw new Error(`head failed: ${head.statusCode} ${head.body}`)
    }

    const rev2 = ulid()
    const push2 = await app.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: auth,
      payload: {
        expectedRevision: rev1,
        envelope: buildEnvelope(namespaceId, rev2, clientDeviceId, '{"hello":"updated"}'),
      },
    })

    if (push2.statusCode !== 201) {
      throw new Error(`push2 failed: ${push2.statusCode} ${push2.body}`)
    }

    const rev3 = ulid()
    const conflict = await app.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: auth,
      payload: {
        expectedRevision: rev1,
        envelope: buildEnvelope(namespaceId, rev3, clientDeviceId, '{"hello":"conflict"}'),
      },
    })

    const conflictBody = conflict.json<{ error: { code: string } }>()
    if (conflict.statusCode !== 409 || conflictBody.error.code !== 'REVISION_CONFLICT') {
      throw new Error(`conflict failed: ${conflict.statusCode} ${conflict.body}`)
    }

    console.log('Faz 3 smoke OK', { namespaceId, rev1, rev2 })
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
