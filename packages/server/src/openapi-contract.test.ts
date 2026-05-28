import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { describe, expect, it, vi } from 'vitest'
import { buildApp } from './app.js'
import { loadConfig } from './config/load-config.js'
import type { DbPool } from './db/pool.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function createMockPool(): DbPool {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT 1')) {
        return { rows: [{ '?column?': 1 }] }
      }

      if (sql.includes('rate_limit_events')) {
        return { rows: [{ count: '0', oldest_at: null }] }
      }

      return { rows: [] }
    }),
    connect: vi.fn(),
    end: vi.fn(async () => undefined),
  } as unknown as DbPool
}

function loadOpenApiOperations() {
  const specPath = join(repoRoot, 'openapi.yaml')
  const spec = parse(readFileSync(specPath, 'utf8')) as {
    paths: Record<string, Record<string, { summary?: string } | undefined>>
  }

  const operations: Array<{ method: string; path: string }> = []

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of Object.keys(methods)) {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
        operations.push({ method: method.toUpperCase(), path })
      }
    }
  }

  return operations
}

function toServerPath(openApiPath: string): string {
  if (openApiPath === '/health') {
    return '/health'
  }

  return `/v1${openApiPath}`.replace(
    /\{namespaceId\}/g,
    '550e8400-e29b-41d4-a716-446655440000',
  ).replace(
    /\{deviceId\}/g,
    '01JFTESTDEVICE000000000000',
  )
}

describe('OpenAPI contract', () => {
  it('registers every documented REST operation (non-404)', async () => {
    const config = loadConfig({
      ESR_DATABASE_URL: 'postgresql://user:pass@localhost:5432/esr',
      ESR_BLOB_PATH: './data/blobs',
      ESR_ADMIN_TOKEN: 'test-admin-token-01234567890123456789012',
    })

    const app = await buildApp({ config, db: createMockPool() })
    await app.ready()

    const operations = loadOpenApiOperations()

    for (const operation of operations) {
      const url = toServerPath(operation.path)
      const response = await app.inject({
        method: operation.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
        url,
      })

      expect(response.statusCode, `${operation.method} ${url}`).not.toBe(404)
    }

    await app.close()
  })
})
