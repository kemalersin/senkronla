import { purgeBlobNamespaceDir } from '../blob/purge.js'
import type { DbPool, DbQueryable } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'

export const SCOPED_DELETE_CONFIRM = {
  namespace: 'delete-namespace',
  app: 'delete-app',
  developer: 'delete-developer',
} as const

export interface ScopedDeleteCounts {
  namespaces: number
  unlockCodes: number
  unlockEvents: number
  apps: number
  developers: number
  blobNamespaceDirs: number
}

async function deleteNamespaceRecords(
  client: DbQueryable,
  namespacePublicId: string,
): Promise<{ unlockCodes: number; unlockEvents: number }> {
  const namespaceResult = await client.query<{ id: string }>(
    'SELECT id FROM namespaces WHERE namespace_id = $1',
    [namespacePublicId],
  )
  const namespace = namespaceResult.rows[0]

  if (!namespace) {
    throw new AppError(404, 'NAMESPACE_NOT_FOUND', 'Namespace not found')
  }

  const unlockEvents =
    (await client.query('DELETE FROM unlock_events WHERE namespace_uuid = $1', [namespace.id]))
      .rowCount ?? 0

  const unlockCodes =
    (await client.query('DELETE FROM unlock_codes WHERE namespace_id = $1', [namespacePublicId]))
      .rowCount ?? 0

  await client.query(
    `DELETE FROM operator_limit_audit WHERE scope_type = 'namespace' AND scope_id = $1`,
    [namespace.id],
  )

  await client.query('DELETE FROM namespaces WHERE id = $1', [namespace.id])

  return { unlockCodes, unlockEvents }
}

async function deleteAppRecords(
  client: DbQueryable,
  appPublicId: string,
): Promise<{ namespacePublicIds: string[]; unlockCodes: number; unlockEvents: number }> {
  const appResult = await client.query<{ id: string }>('SELECT id FROM apps WHERE app_id = $1', [
    appPublicId,
  ])
  const app = appResult.rows[0]

  if (!app) {
    throw new AppError(404, 'APP_NOT_FOUND', 'Application not found')
  }

  const namespaces = await client.query<{ namespace_id: string }>(
    'SELECT namespace_id FROM namespaces WHERE app_uuid = $1',
    [app.id],
  )

  let unlockCodes = 0
  let unlockEvents = 0
  const namespacePublicIds: string[] = []

  for (const row of namespaces.rows) {
    const deleted = await deleteNamespaceRecords(client, row.namespace_id)
    unlockCodes += deleted.unlockCodes
    unlockEvents += deleted.unlockEvents
    namespacePublicIds.push(row.namespace_id)
  }

  await client.query(
    `DELETE FROM operator_limit_audit WHERE scope_type = 'app' AND scope_id = $1`,
    [app.id],
  )
  await client.query('DELETE FROM rate_limit_usage_buckets WHERE app_uuid = $1', [app.id])
  await client.query('DELETE FROM apps WHERE id = $1', [app.id])

  return { namespacePublicIds, unlockCodes, unlockEvents }
}

export async function deleteAdminNamespace(
  pool: DbPool,
  blobRoot: string,
  namespacePublicId: string,
): Promise<ScopedDeleteCounts> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const deleted = await deleteNamespaceRecords(client, namespacePublicId)
    await client.query('COMMIT')

    const blobRemoved = (await purgeBlobNamespaceDir(blobRoot, namespacePublicId)) ? 1 : 0

    return {
      namespaces: 1,
      unlockCodes: deleted.unlockCodes,
      unlockEvents: deleted.unlockEvents,
      apps: 0,
      developers: 0,
      blobNamespaceDirs: blobRemoved,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function deleteAdminApp(
  pool: DbPool,
  blobRoot: string,
  appPublicId: string,
): Promise<ScopedDeleteCounts> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const deleted = await deleteAppRecords(client, appPublicId)
    await client.query('COMMIT')

    let blobNamespaceDirs = 0
    for (const namespacePublicId of deleted.namespacePublicIds) {
      if (await purgeBlobNamespaceDir(blobRoot, namespacePublicId)) {
        blobNamespaceDirs += 1
      }
    }

    return {
      namespaces: deleted.namespacePublicIds.length,
      unlockCodes: deleted.unlockCodes,
      unlockEvents: deleted.unlockEvents,
      apps: 1,
      developers: 0,
      blobNamespaceDirs,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function deleteAdminDeveloper(
  pool: DbPool,
  blobRoot: string,
  developerId: string,
): Promise<ScopedDeleteCounts> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const developerResult = await client.query<{ id: string }>(
      'SELECT id FROM developers WHERE id = $1',
      [developerId],
    )
    const developer = developerResult.rows[0]

    if (!developer) {
      throw new AppError(404, 'NOT_FOUND', 'Developer not found')
    }

    const apps = await client.query<{ app_id: string }>(
      'SELECT app_id FROM apps WHERE developer_uuid = $1',
      [developer.id],
    )

    let namespaces = 0
    let unlockCodes = 0
    let unlockEvents = 0
    let appsDeleted = 0
    let blobNamespaceDirs = 0
    const namespacePublicIds: string[] = []

    for (const app of apps.rows) {
      const deleted = await deleteAppRecords(client, app.app_id)
      appsDeleted += 1
      namespaces += deleted.namespacePublicIds.length
      unlockCodes += deleted.unlockCodes
      unlockEvents += deleted.unlockEvents
      namespacePublicIds.push(...deleted.namespacePublicIds)
    }

    await client.query(
      `DELETE FROM operator_limit_audit WHERE scope_type = 'developer' AND scope_id = $1`,
      [developer.id],
    )
    await client.query('DELETE FROM developers WHERE id = $1', [developer.id])

    await client.query('COMMIT')

    for (const namespacePublicId of namespacePublicIds) {
      if (await purgeBlobNamespaceDir(blobRoot, namespacePublicId)) {
        blobNamespaceDirs += 1
      }
    }

    return {
      namespaces,
      unlockCodes,
      unlockEvents,
      apps: appsDeleted,
      developers: 1,
      blobNamespaceDirs,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}