import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

const DEVELOPER_FILTERS = ['all', 'verified', 'unverified', 'disabled'] as const
export type AdminDeveloperFilter = (typeof DEVELOPER_FILTERS)[number]

export interface PaginationInput {
  limit?: number
  offset?: number
}

export interface AdminDeveloperSummary {
  id: string
  email: string
  emailVerified: boolean
  disabled: boolean
  disabledAt: string | null
  appCount: number
  createdAt: string
}

export interface PaginatedDevelopersResult {
  items: AdminDeveloperSummary[]
  total: number
  limit: number
  offset: number
}

export interface UpdateAdminDeveloperInput {
  disabled?: boolean
  emailVerified?: boolean
}

interface DeveloperListRow {
  id: string
  email: string
  email_verified_at: Date | null
  disabled_at: Date | null
  created_at: Date
  app_count: string
}

function resolveLimit(limit?: number): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT
  }

  return Math.min(Math.max(limit, 1), MAX_LIMIT)
}

function resolveOffset(offset?: number): number {
  return Math.max(offset ?? 0, 0)
}

function mapDeveloperSummary(row: DeveloperListRow): AdminDeveloperSummary {
  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified_at),
    disabled: Boolean(row.disabled_at),
    disabledAt: row.disabled_at?.toISOString() ?? null,
    appCount: Number(row.app_count),
    createdAt: row.created_at.toISOString(),
  }
}

function filterClause(filter: AdminDeveloperFilter): string {
  switch (filter) {
    case 'verified':
      return 'AND d.email_verified_at IS NOT NULL AND d.disabled_at IS NULL'
    case 'unverified':
      return 'AND d.email_verified_at IS NULL AND d.disabled_at IS NULL'
    case 'disabled':
      return 'AND d.disabled_at IS NOT NULL'
    default:
      return ''
  }
}

export async function listAdminDevelopers(
  pool: DbPool,
  input: PaginationInput & { q?: string; filter?: AdminDeveloperFilter },
): Promise<PaginatedDevelopersResult> {
  const limit = resolveLimit(input.limit)
  const offset = resolveOffset(input.offset)
  const pattern = input.q?.trim() ? `%${input.q.trim()}%` : null
  const filter = input.filter ?? 'all'
  const whereFilter = filterClause(filter)

  const result = await pool.query<DeveloperListRow>(
    `SELECT d.id, d.email, d.email_verified_at, d.disabled_at, d.created_at,
            (SELECT COUNT(*)::text FROM apps a WHERE a.developer_uuid = d.id) AS app_count
     FROM developers d
     WHERE ($1::text IS NULL OR d.email ILIKE $1)
       ${whereFilter}
     ORDER BY d.created_at DESC
     LIMIT $2 OFFSET $3`,
    [pattern, limit, offset],
  )

  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM developers d
     WHERE ($1::text IS NULL OR d.email ILIKE $1)
       ${whereFilter}`,
    [pattern],
  )

  return {
    items: result.rows.map(mapDeveloperSummary),
    total: Number(totalResult.rows[0]?.count ?? 0),
    limit,
    offset,
  }
}

export async function getAdminDeveloper(
  pool: DbPool,
  developerUuid: string,
): Promise<AdminDeveloperSummary> {
  const result = await pool.query<DeveloperListRow>(
    `SELECT d.id, d.email, d.email_verified_at, d.disabled_at, d.created_at,
            (SELECT COUNT(*)::text FROM apps a WHERE a.developer_uuid = d.id) AS app_count
     FROM developers d
     WHERE d.id = $1`,
    [developerUuid],
  )

  const row = result.rows[0]
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Developer account not found')
  }

  return mapDeveloperSummary(row)
}

export async function updateAdminDeveloper(
  pool: DbPool,
  developerUuid: string,
  input: UpdateAdminDeveloperInput,
): Promise<AdminDeveloperSummary> {
  if (input.disabled === undefined && input.emailVerified === undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one of disabled or emailVerified is required')
  }

  await getAdminDeveloper(pool, developerUuid)

  const sets: string[] = []
  const values: unknown[] = [developerUuid]
  let paramIndex = 2

  if (input.disabled !== undefined) {
    sets.push(`disabled_at = $${paramIndex++}`)
    values.push(input.disabled ? new Date() : null)

    if (input.disabled) {
      sets.push('session_version = session_version + 1')
    }
  }

  if (input.emailVerified !== undefined) {
    sets.push(`email_verified_at = $${paramIndex++}`)
    values.push(input.emailVerified ? new Date() : null)
  }

  await pool.query(
    `UPDATE developers
     SET ${sets.join(', ')}
     WHERE id = $1`,
    values,
  )

  return getAdminDeveloper(pool, developerUuid)
}
