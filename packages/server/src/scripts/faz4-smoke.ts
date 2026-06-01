import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { randomUUID } from 'node:crypto'
import {
  buildRecoveryKeyProof,
  generateRecoveryPhrase,
  sha256Hex,
} from '@senkronla/protocol'
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

function buildEnvelope(namespaceId: string, revision: string, deviceId: string) {
  const payload = JSON.stringify({
    magic: 'ENV-RAW1',
    data: '{"hello":"world"}',
  })

  return {
    magic: 'ESR-DOC1',
    schemaVersion: 1,
    namespaceId,
    namespaceLabel: 'Recovery Smoke',
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
    const hostClientDeviceId = randomUUID()
    const recoveryPhrase = generateRecoveryPhrase()
    const recoveryKeyProof = await buildRecoveryKeyProof(recoveryPhrase)

    const create = await app.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Recovery Smoke',
        recoveryKeyProof,
        deviceLabel: 'Host',
        clientDeviceId: hostClientDeviceId,
      },
    })

    if (create.statusCode !== 201) {
      throw new Error(`create failed: ${create.statusCode} ${create.body}`)
    }

    const { deviceToken: oldToken } = create.json<{ deviceToken: string }>()
    const revision = ulid()

    const push = await app.inject({
      method: 'PUT',
      url: `/v1/namespaces/${namespaceId}/documents/primary`,
      headers: { authorization: `Bearer ${oldToken}` },
      payload: {
        envelope: buildEnvelope(namespaceId, revision, hostClientDeviceId),
      },
    })

    if (push.statusCode !== 201) {
      throw new Error(`push failed: ${push.statusCode} ${push.body}`)
    }

    const recoverProof = await buildRecoveryKeyProof(recoveryPhrase, {
      salt: recoveryKeyProof.salt,
    })
    const recoveredClientDeviceId = randomUUID()

    const recover = await app.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/recover`,
      payload: {
        recoveryKeyProof: recoverProof,
        deviceLabel: 'Recovered Laptop',
        clientDeviceId: recoveredClientDeviceId,
      },
    })

    if (recover.statusCode !== 200) {
      throw new Error(`recover failed: ${recover.statusCode} ${recover.body}`)
    }

    const recovered = recover.json<{ deviceToken: string; revokedDeviceCount: number }>()

    const oldTokenCheck = await app.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}`,
      headers: { authorization: `Bearer ${oldToken}` },
    })

    if (oldTokenCheck.statusCode !== 401) {
      throw new Error(`old token still valid: ${oldTokenCheck.statusCode}`)
    }

    const headMeta = await app.inject({
      method: 'GET',
      url: `/v1/namespaces/${namespaceId}/documents/primary/head/meta`,
      headers: { authorization: `Bearer ${recovered.deviceToken}` },
    })

    if (headMeta.statusCode !== 200 || headMeta.json<{ revision: string }>().revision !== revision) {
      throw new Error(`head not preserved: ${headMeta.statusCode} ${headMeta.body}`)
    }

    console.log('Faz 4 smoke OK', {
      namespaceId,
      revokedDeviceCount: recovered.revokedDeviceCount,
      revision,
    })
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
