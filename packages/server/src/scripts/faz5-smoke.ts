import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { randomUUID } from 'node:crypto'
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

async function main() {
  const config = loadConfig()
  if (!config.auth.adminApiToken) {
    throw new Error('ESR_ADMIN_TOKEN must be configured for Faz 5 smoke test')
  }

  const db = createPool(config)
  const app = await buildApp({ config, db })
  await app.ready()

  try {
    const namespaceId = randomUUID()
    const hostClientDeviceId = randomUUID()

    const create = await app.inject({
      method: 'POST',
      url: '/v1/namespaces',
      payload: {
        namespaceId,
        namespaceLabel: 'Unlock Smoke',
        recoveryKeySalt: 'c2FsdA',
        recoveryKeyHash: 'aGFzaA',
        deviceLabel: 'Host',
        clientDeviceId: hostClientDeviceId,
      },
    })

    if (create.statusCode !== 201) {
      throw new Error(`create failed: ${create.statusCode} ${create.body}`)
    }

    const { deviceToken: hostToken } = create.json<{ deviceToken: string }>()

    const pairing = await app.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { ttlSeconds: 600 },
    })

    if (pairing.statusCode !== 201) {
      throw new Error(`pairing token failed: ${pairing.statusCode} ${pairing.body}`)
    }

    const join = await app.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/devices`,
      payload: {
        pairingCode: pairing.json<{ code: string }>().code,
        deviceLabel: 'Phone',
        clientDeviceId: randomUUID(),
      },
    })

    if (join.statusCode !== 201) {
      throw new Error(`pair failed: ${join.statusCode} ${join.body}`)
    }

    const limitCheck = await app.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {},
    })

    if (limitCheck.statusCode !== 403) {
      throw new Error(`expected limit 403, got ${limitCheck.statusCode}`)
    }

    const admin = await app.inject({
      method: 'POST',
      url: '/v1/admin/unlock-codes',
      headers: { authorization: `Bearer ${config.auth.adminApiToken}` },
      payload: {
        namespaceId,
        slots: 3,
        note: 'Faz 5 smoke',
      },
    })

    if (admin.statusCode !== 201) {
      throw new Error(`admin generate failed: ${admin.statusCode} ${admin.body}`)
    }

    const { unlockCode } = admin.json<{ unlockCode: string }>()

    const redeem = await app.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/unlock`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { unlockCode },
    })

    if (redeem.statusCode !== 200) {
      throw new Error(`redeem failed: ${redeem.statusCode} ${redeem.body}`)
    }

    const pairingAfterUnlock = await app.inject({
      method: 'POST',
      url: `/v1/namespaces/${namespaceId}/pairing-tokens`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {},
    })

    if (pairingAfterUnlock.statusCode !== 201) {
      throw new Error(`pairing after unlock failed: ${pairingAfterUnlock.statusCode} ${pairingAfterUnlock.body}`)
    }

    console.log('Faz 5 smoke OK', {
      namespaceId,
      unlockCode,
      redeemed: redeem.json(),
    })
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
