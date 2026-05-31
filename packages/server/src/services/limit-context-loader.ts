import type { DbPool } from '../db/pool.js'
import type { AppRow, DeveloperRow, NamespaceRow } from '../types/db.js'
import { findAppByPublicId } from './app-registry-service.js'
import type { LimitContext } from './limit-resolution-service.js'

export async function findDeveloperByUuid(
  pool: DbPool,
  developerUuid: string,
): Promise<DeveloperRow | null> {
  const result = await pool.query<DeveloperRow>(
    `SELECT id, email, email_verified_at, disabled_at, limit_overrides, created_at
     FROM developers
     WHERE id = $1`,
    [developerUuid],
  )

  return result.rows[0] ?? null
}

export async function findAppByUuid(pool: DbPool, appUuid: string): Promise<AppRow | null> {
  const result = await pool.query<AppRow>(
    `SELECT id, app_id, developer_uuid, name, type, status, client_secret_hash,
            limit_overrides, created_at, updated_at
     FROM apps
     WHERE id = $1`,
    [appUuid],
  )

  return result.rows[0] ?? null
}

export async function loadLimitContext(
  pool: DbPool,
  input: {
    namespace?: NamespaceRow | null
    app?: AppRow | null
    appUuid?: string | null
    appId?: string | null
  },
): Promise<LimitContext> {
  let app = input.app ?? null
  let namespace = input.namespace ?? null

  if (!app && input.appId) {
    app = await findAppByPublicId(pool, input.appId)
  }

  if (!app && input.appUuid) {
    app = await findAppByUuid(pool, input.appUuid)
  }

  if (!app && namespace?.app_uuid) {
    app = await findAppByUuid(pool, namespace.app_uuid)
  }

  let developer: DeveloperRow | null = null
  if (app?.developer_uuid) {
    developer = await findDeveloperByUuid(pool, app.developer_uuid)
  }

  return {
    namespace,
    app,
    developer,
  }
}
