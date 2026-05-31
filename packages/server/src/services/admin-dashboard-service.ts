import type { DbPool } from '../db/pool.js'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

export interface PaginationInput {
  limit?: number
  offset?: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface AdminOverview {
  namespaces: number
  activeDevices: number
  revokedDevices: number
  documents: number
  pendingUnlockCodes: number
  redeemedUnlockCodes: number
  unlockEvents: number
  rateLimitEvents: number
  activePairingTokens: number
}

export interface AdminNamespaceRow {
  namespaceId: string
  namespaceLabel: string
  freeDeviceLimit: number
  purchasedSlots: number
  activeDevices: number
  createdAt: string
  documentCount: number
  documentRevision: string | null
  documentWrittenAt: string | null
  documentSizeBytes: number | null
  appId: string | null
  appName: string | null
  developerEmail: string | null
}

export interface AdminUnlockCodeRow {
  code: string
  namespaceId: string
  slots: number
  expiresAt: string | null
  redeemedAt: string | null
  note: string | null
  createdAt: string
}

export interface AdminUnlockEventRow {
  id: string
  namespaceId: string
  namespaceLabel: string
  slotsAdded: number
  source: string
  unlockCode: string | null
  createdAt: string
}

export interface AdminRateLimitGroupRow {
  action: string
  namespaceId: string | null
  clientDeviceId: string | null
  clientIp: string | null
  periodStart: string
  periodEnd: string
  count: number
}

export interface ListQueryInput extends PaginationInput {
  q?: string
  action?: string
  appId?: string
}

function resolveSearchPattern(q?: string): string | null {
  const trimmed = q?.trim()
  if (!trimmed) {
    return null
  }

  const sanitized = trimmed.replace(/[%_\\]/g, '')
  if (!sanitized) {
    return null
  }

  return `%${sanitized}%`
}

function resolvePagination(input: PaginationInput): { limit: number; offset: number } {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const offset = Math.max(input.offset ?? 0, 0)
  return { limit, offset }
}

export async function getAdminOverview(pool: DbPool): Promise<AdminOverview> {
  const result = await pool.query<{
    namespaces: string
    active_devices: string
    revoked_devices: string
    documents: string
    pending_unlock_codes: string
    redeemed_unlock_codes: string
    unlock_events: string
    rate_limit_events: string
    active_pairing_tokens: string
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM namespaces) AS namespaces,
      (SELECT COUNT(*)::text FROM devices WHERE revoked_at IS NULL) AS active_devices,
      (SELECT COUNT(*)::text FROM devices WHERE revoked_at IS NOT NULL) AS revoked_devices,
      (SELECT COUNT(*)::text FROM document_heads) AS documents,
      (SELECT COUNT(*)::text FROM unlock_codes WHERE redeemed_at IS NULL) AS pending_unlock_codes,
      (SELECT COUNT(*)::text FROM unlock_codes WHERE redeemed_at IS NOT NULL) AS redeemed_unlock_codes,
      (SELECT COUNT(*)::text FROM unlock_events) AS unlock_events,
      (SELECT COUNT(*)::text FROM rate_limit_events) AS rate_limit_events,
      (SELECT COUNT(*)::text FROM pairing_tokens
        WHERE redeemed_at IS NULL AND expires_at > now()) AS active_pairing_tokens
  `)

  const row = result.rows[0]

  return {
    namespaces: Number(row?.namespaces ?? 0),
    activeDevices: Number(row?.active_devices ?? 0),
    revokedDevices: Number(row?.revoked_devices ?? 0),
    documents: Number(row?.documents ?? 0),
    pendingUnlockCodes: Number(row?.pending_unlock_codes ?? 0),
    redeemedUnlockCodes: Number(row?.redeemed_unlock_codes ?? 0),
    unlockEvents: Number(row?.unlock_events ?? 0),
    rateLimitEvents: Number(row?.rate_limit_events ?? 0),
    activePairingTokens: Number(row?.active_pairing_tokens ?? 0),
  }
}

export async function listAdminNamespaces(
  pool: DbPool,
  input: ListQueryInput = {},
  appsEnabled = false,
): Promise<PaginatedResult<AdminNamespaceRow>> {
  const { limit, offset } = resolvePagination(input)
  const searchPattern = resolveSearchPattern(input.q)
  const appId = appsEnabled ? input.appId?.trim() || null : null
  const searchWhere = appsEnabled
    ? `($3::text IS NULL OR (
      n.namespace_id ILIKE $3 OR
      n.namespace_label ILIKE $3 OR
      COALESCE(dh.revision, '') ILIKE $3 OR
      COALESCE(a.app_id, '') ILIKE $3 OR
      COALESCE(a.name, '') ILIKE $3 OR
      COALESCE(d.email, '') ILIKE $3
    ))`
    : `($3::text IS NULL OR (
      n.namespace_id ILIKE $3 OR
      n.namespace_label ILIKE $3 OR
      COALESCE(dh.revision, '') ILIKE $3
    ))`
  const appIdWhere = appsEnabled ? 'AND ($4::text IS NULL OR a.app_id = $4)' : ''
  const params = appsEnabled
    ? [limit, offset, searchPattern, appId]
    : [limit, offset, searchPattern]

  const result = await pool.query<{
    namespace_id: string
    namespace_label: string
    free_device_limit: number
    purchased_slots: number
    active_devices: string
    created_at: Date
    revision: string | null
    written_at: Date | null
    size_bytes: string | null
    document_count: string
    app_id: string | null
    app_name: string | null
    developer_email: string | null
    total_count: string
  }>(
    `
    SELECT
      n.namespace_id,
      n.namespace_label,
      n.free_device_limit,
      n.purchased_slots,
      n.created_at,
      (
        SELECT COUNT(*)::text
        FROM devices d
        WHERE d.namespace_uuid = n.id AND d.revoked_at IS NULL
      ) AS active_devices,
      dh.revision,
      dh.written_at,
      dh.size_bytes::text,
      (
        SELECT COUNT(*)::text
        FROM document_heads dh_all
        WHERE dh_all.namespace_uuid = n.id
      ) AS document_count,
      a.app_id,
      a.name AS app_name,
      d.email AS developer_email,
      COUNT(*) OVER() AS total_count
    FROM namespaces n
    LEFT JOIN document_heads dh
      ON dh.namespace_uuid = n.id AND dh.document_id = 'primary'
    LEFT JOIN apps a ON a.id = n.app_uuid
    LEFT JOIN developers d ON d.id = a.developer_uuid
    WHERE ${searchWhere}
    ${appIdWhere}
    ORDER BY n.created_at DESC
    LIMIT $1 OFFSET $2
    `,
    params,
  )

  const total = Number(result.rows[0]?.total_count ?? 0)

  return {
    items: result.rows.map((row) => ({
      namespaceId: row.namespace_id,
      namespaceLabel: row.namespace_label,
      freeDeviceLimit: row.free_device_limit,
      purchasedSlots: row.purchased_slots,
      activeDevices: Number(row.active_devices),
      createdAt: row.created_at.toISOString(),
      documentCount: Number(row.document_count),
      documentRevision: row.revision,
      documentWrittenAt: row.written_at?.toISOString() ?? null,
      documentSizeBytes: row.size_bytes ? Number(row.size_bytes) : null,
      appId: row.app_id,
      appName: row.app_name,
      developerEmail: row.developer_email,
    })),
    total,
    limit,
    offset,
  }
}

export async function listAdminUnlockCodes(
  pool: DbPool,
  input: ListQueryInput = {},
): Promise<PaginatedResult<AdminUnlockCodeRow>> {
  const { limit, offset } = resolvePagination(input)
  const searchPattern = resolveSearchPattern(input.q)

  const result = await pool.query<{
    code: string
    namespace_id: string
    slots: number
    expires_at: Date | null
    redeemed_at: Date | null
    note: string | null
    created_at: Date
    total_count: string
  }>(
    `
    SELECT
      code,
      namespace_id,
      slots,
      expires_at,
      redeemed_at,
      note,
      created_at,
      COUNT(*) OVER() AS total_count
    FROM unlock_codes
    WHERE ($3::text IS NULL OR (
      code ILIKE $3 OR
      namespace_id ILIKE $3 OR
      COALESCE(note, '') ILIKE $3
    ))
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset, searchPattern],
  )

  const total = Number(result.rows[0]?.total_count ?? 0)

  return {
    items: result.rows.map((row) => ({
      code: row.code,
      namespaceId: row.namespace_id,
      slots: row.slots,
      expiresAt: row.expires_at?.toISOString() ?? null,
      redeemedAt: row.redeemed_at?.toISOString() ?? null,
      note: row.note,
      createdAt: row.created_at.toISOString(),
    })),
    total,
    limit,
    offset,
  }
}

export async function listAdminUnlockEvents(
  pool: DbPool,
  input: ListQueryInput = {},
): Promise<PaginatedResult<AdminUnlockEventRow>> {
  const { limit, offset } = resolvePagination(input)
  const searchPattern = resolveSearchPattern(input.q)

  const result = await pool.query<{
    id: string
    namespace_id: string
    namespace_label: string
    slots_added: number
    source: string
    unlock_code: string | null
    created_at: Date
    total_count: string
  }>(
    `
    SELECT
      ue.id,
      n.namespace_id,
      n.namespace_label,
      ue.slots_added,
      ue.source,
      ue.unlock_code,
      ue.created_at,
      COUNT(*) OVER() AS total_count
    FROM unlock_events ue
    JOIN namespaces n ON n.id = ue.namespace_uuid
    WHERE ($3::text IS NULL OR (
      n.namespace_id ILIKE $3 OR
      n.namespace_label ILIKE $3 OR
      COALESCE(ue.unlock_code, '') ILIKE $3 OR
      ue.source ILIKE $3
    ))
    ORDER BY ue.created_at DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset, searchPattern],
  )

  const total = Number(result.rows[0]?.total_count ?? 0)

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      namespaceId: row.namespace_id,
      namespaceLabel: row.namespace_label,
      slotsAdded: row.slots_added,
      source: row.source,
      unlockCode: row.unlock_code,
      createdAt: row.created_at.toISOString(),
    })),
    total,
    limit,
    offset,
  }
}

export async function listAdminRateLimitEvents(
  pool: DbPool,
  input: ListQueryInput = {},
): Promise<PaginatedResult<AdminRateLimitGroupRow>> {
  const { limit, offset } = resolvePagination(input)
  const searchPattern = resolveSearchPattern(input.q)
  const actionFilter = input.action?.trim() || null

  const result = await pool.query<{
    action: string
    namespace_id: string | null
    client_device_id: string | null
    client_ip: string | null
    period_start: Date
    period_end: Date
    event_count: number
    total_count: string
  }>(
    `
    WITH grouped AS (
      SELECT
        rle.action,
        COALESCE(n.namespace_id, n2.namespace_id) AS namespace_id,
        d.client_device_id,
        rle.client_ip,
        CASE
          WHEN rle.action = 'global_ip' THEN date_trunc('minute', rle.created_at)
          ELSE date_trunc('hour', rle.created_at)
        END AS period_start,
        COUNT(*)::int AS event_count
      FROM rate_limit_events rle
      LEFT JOIN namespaces n ON n.id = rle.namespace_uuid
      LEFT JOIN devices d ON d.id = rle.device_uuid
      LEFT JOIN namespaces n2 ON n2.id = d.namespace_uuid
      WHERE COALESCE(n.namespace_id, n2.namespace_id) IS NOT NULL
        AND ($3::text IS NULL OR rle.action = $3)
      GROUP BY
        rle.action,
        COALESCE(n.namespace_id, n2.namespace_id),
        d.client_device_id,
        rle.client_ip,
        CASE
          WHEN rle.action = 'global_ip' THEN date_trunc('minute', rle.created_at)
          ELSE date_trunc('hour', rle.created_at)
        END
    )
    SELECT
      action,
      namespace_id,
      client_device_id,
      client_ip,
      period_start,
      CASE
        WHEN action = 'global_ip' THEN period_start + interval '1 minute'
        ELSE period_start + interval '1 hour'
      END AS period_end,
      event_count,
      COUNT(*) OVER() AS total_count
    FROM grouped
    WHERE ($4::text IS NULL OR (
      namespace_id ILIKE $4 OR
      COALESCE(client_device_id, '') ILIKE $4 OR
      COALESCE(client_ip, '') ILIKE $4
    ))
    ORDER BY period_start DESC, event_count DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset, actionFilter, searchPattern],
  )

  const total = Number(result.rows[0]?.total_count ?? 0)

  return {
    items: result.rows.map((row) => ({
      action: row.action,
      namespaceId: row.namespace_id,
      clientDeviceId: row.client_device_id,
      clientIp: row.client_ip,
      periodStart: row.period_start.toISOString(),
      periodEnd: row.period_end.toISOString(),
      count: row.event_count,
    })),
    total,
    limit,
    offset,
  }
}
