import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
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
      database: { status: 'ok', mode: 'external' },
      blob: { status: 'ok' },
      developerPortal: { enabled: false },
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
})

describe('logging redaction config', () => {
  it('includes sensitive field paths from config', () => {
    const config = loadConfig({})
    expect(config.logging.redactPaths).toEqual(
      expect.arrayContaining(['envelope.payload', 'deviceToken', 'recoveryKeyProof']),
    )
  })
})
