import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { SERVER_VERSION } from './version.js'
import type { DbPool } from './db/pool.js'

function createMockPool(options?: { failDatabase?: boolean }): DbPool {
  return {
    query: vi.fn(async (sql: string) => {
      if (options?.failDatabase) {
        throw new Error('connection refused')
      }

      if (sql.includes('SELECT 1')) {
        return { rows: [{ '?column?': 1 }] }
      }

      return { rows: [] }
    }),
    connect: vi.fn(),
    end: vi.fn(async () => undefined),
  } as unknown as DbPool
}

describe('@senkronla/server health', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ok when database and blob checks pass', async () => {
    const config = loadConfig({
      ESR_DATABASE_URL: 'postgresql://user:pass@localhost:5432/esr',
      ESR_BLOB_PATH: await mkdtemp(join(tmpdir(), 'senkronla-blob-')),
    })

    const app = await buildApp({ config, db: createMockPool() })
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'ok',
      version: SERVER_VERSION,
      database: { status: 'ok', mode: 'external' },
      blob: { status: 'ok' },
      websocket: expect.any(Boolean),
      developerPortal: { enabled: false },
      apps: {
        enabled: false,
        nativeRequireClientSecret: false,
      },
    })

    await app.close()
  })

  it('returns 503 when database check fails', async () => {
    const config = loadConfig({
      ESR_DATABASE_URL: 'postgresql://user:pass@localhost:5432/esr',
      ESR_BLOB_PATH: await mkdtemp(join(tmpdir(), 'senkronla-blob-')),
    })

    const app = await buildApp({ config, db: createMockPool({ failDatabase: true }) })
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({
      status: 'degraded',
      database: { status: 'error' },
      blob: { status: 'ok' },
    })

    await app.close()
  })

  it('returns 503 when blob storage is not writable', async () => {
    const config = loadConfig({
      ESR_DATABASE_URL: 'postgresql://user:pass@localhost:5432/esr',
      ESR_BLOB_PATH: '/root/senkronla-should-not-write',
    })

    const app = await buildApp({ config, db: createMockPool() })
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({
      status: 'degraded',
      blob: { status: 'error' },
    })

    await app.close()
  })

  it('returns all HealthStatus fields when apps registry is enabled', async () => {
    const config = loadConfig({
      ESR_DATABASE_URL: 'postgresql://user:pass@localhost:5432/esr',
      ESR_BLOB_PATH: await mkdtemp(join(tmpdir(), 'senkronla-blob-')),
      ESR_APPS__ENABLED: 'true',
      ESR_APPS__REGISTRATION_MODE: 'self_service',
      ESR_DEVELOPER_JWT_SECRET: 'x'.repeat(32),
      ESR_APPS__NATIVE__REQUIRE_CLIENT_SECRET: 'true',
      ESR_WEBSOCKET__ENABLED: 'true',
    })

    const app = await buildApp({ config, db: createMockPool() })
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
      version: SERVER_VERSION,
      database: { status: 'ok', mode: 'external' },
      blob: { status: 'ok' },
      websocket: true,
      developerPortal: { enabled: true },
      apps: {
        enabled: true,
        nativeRequireClientSecret: true,
      },
    })

    await app.close()
  })

  it('includes blob path for valid admin bearer token', async () => {
    const adminToken = 'test-admin-token-01234567890123456789012'
    const config = loadConfig({
      ESR_DATABASE_URL: 'postgresql://user:pass@localhost:5432/esr',
      ESR_BLOB_PATH: await mkdtemp(join(tmpdir(), 'senkronla-blob-')),
      ESR_ADMIN_TOKEN: adminToken,
    })

    const app = await buildApp({ config, db: createMockPool() })
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().blob).toEqual({
      status: 'ok',
      path: config.blob.filesystem.path,
    })

    await app.close()
  })

  it('omits blob path for invalid admin bearer token', async () => {
    const config = loadConfig({
      ESR_DATABASE_URL: 'postgresql://user:pass@localhost:5432/esr',
      ESR_BLOB_PATH: await mkdtemp(join(tmpdir(), 'senkronla-blob-')),
      ESR_ADMIN_TOKEN: 'test-admin-token-01234567890123456789012',
    })

    const app = await buildApp({ config, db: createMockPool() })
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { authorization: 'Bearer wrong-admin-token-012345678901234567890' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().blob).toEqual({ status: 'ok' })
    expect(response.json().blob).not.toHaveProperty('path')

    await app.close()
  })
})

describe('logging redaction config', () => {
  it('includes sensitive field paths from config', () => {
    const config = loadConfig({})
    expect(config.logging.redactPaths).toEqual(
      expect.arrayContaining(['envelope.payload', 'deviceToken', 'recoveryKeyProof']),
    )
  })
})
