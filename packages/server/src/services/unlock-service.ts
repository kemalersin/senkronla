import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { canAddDevice, loadNamespaceLimits } from './slot-service.js'
import type { NamespaceRow } from '../types/db.js'

export interface UnlockCodeRow {
  code: string
  namespace_id: string
  slots: number
  expires_at: Date | null
  redeemed_at: Date | null
  note: string | null
  created_at: Date
}

export interface CreateUnlockCodeInput {
  namespaceId: string
  slots: number
  expiresAt?: string | null
  note?: string | null
}

export interface CreateUnlockCodeResult {
  unlockCode: string
  slots: number
  expiresAt: string | null
}

export interface RedeemUnlockCodeResult {
  slotsAdded: number
  purchasedSlots: number
  maxDevices: number
  canAddDevice: boolean
}

const UNLOCK_CODE_RANDOM_LENGTH = 12
const MAX_UNLOCK_SLOTS = 999

export function formatUnlockCode(codePrefix: string, slots: number, randomPart: string): string {
  return `${codePrefix}-${slots}-${randomPart}`
}

export function generateUnlockCodeRandomPart(): string {
  return randomBytes(9)
    .toString('base64url')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, UNLOCK_CODE_RANDOM_LENGTH)
    .toUpperCase()
    .padEnd(UNLOCK_CODE_RANDOM_LENGTH, 'A')
}

function resolveDefaultExpiry(config: ServerConfig): Date {
  const expiresAt = new Date()
  expiresAt.setUTCDate(expiresAt.getUTCDate() + config.unlock.defaultExpiryDays)
  return expiresAt
}

function assertUnlockCodeUsable(
  row: UnlockCodeRow,
  namespace: NamespaceRow,
): void {
  if (row.namespace_id !== namespace.namespace_id) {
    throw new AppError(400, 'UNLOCK_CODE_INVALID', 'Unlock code is invalid or expired')
  }

  if (row.redeemed_at) {
    throw new AppError(409, 'UNLOCK_CODE_ALREADY_REDEEMED', 'Unlock code has already been redeemed')
  }

  if (row.expires_at && row.expires_at.getTime() <= Date.now()) {
    throw new AppError(400, 'UNLOCK_CODE_INVALID', 'Unlock code is invalid or expired')
  }
}

export async function createUnlockCode(
  pool: DbPool,
  config: ServerConfig,
  input: CreateUnlockCodeInput,
): Promise<CreateUnlockCodeResult> {
  if (!Number.isInteger(input.slots) || input.slots < 1 || input.slots > MAX_UNLOCK_SLOTS) {
    throw new AppError(400, 'VALIDATION_ERROR', 'slots must be an integer between 1 and 999', {
      fields: [{ path: 'slots', message: 'Invalid slot count' }],
    })
  }

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : resolveDefaultExpiry(config)
  if (Number.isNaN(expiresAt.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'expiresAt must be a valid ISO datetime', {
      fields: [{ path: 'expiresAt', message: 'Invalid datetime' }],
    })
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = formatUnlockCode(
      config.unlock.codePrefix,
      input.slots,
      generateUnlockCodeRandomPart(),
    )

    try {
      await pool.query(
        `INSERT INTO unlock_codes (code, namespace_id, slots, expires_at, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [code, input.namespaceId, input.slots, expiresAt.toISOString(), input.note ?? null],
      )

      return {
        unlockCode: code,
        slots: input.slots,
        expiresAt: expiresAt.toISOString(),
      }
    } catch (error) {
      const pgError = error as { code?: string }
      if (pgError.code === '23505' && attempt < 4) {
        continue
      }
      throw error
    }
  }

  throw new AppError(500, 'INTERNAL_ERROR', 'Failed to generate a unique unlock code')
}

export async function redeemUnlockCode(
  pool: DbPool,
  config: ServerConfig,
  namespace: NamespaceRow,
  unlockCode: string,
): Promise<RedeemUnlockCodeResult> {
  const normalizedCode = unlockCode.trim()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const codeResult = await client.query<UnlockCodeRow>(
      `SELECT code, namespace_id, slots, expires_at, redeemed_at, note, created_at
       FROM unlock_codes
       WHERE code = $1
       FOR UPDATE`,
      [normalizedCode],
    )

    const row = codeResult.rows[0]
    if (!row) {
      throw new AppError(400, 'UNLOCK_CODE_INVALID', 'Unlock code is invalid or expired')
    }

    assertUnlockCodeUsable(row, namespace)

    await client.query(
      `UPDATE unlock_codes
       SET redeemed_at = now()
       WHERE code = $1`,
      [normalizedCode],
    )

    const namespaceResult = await client.query<Pick<NamespaceRow, 'purchased_slots' | 'free_device_limit'>>(
      `UPDATE namespaces
       SET purchased_slots = purchased_slots + $2,
           updated_at = now()
       WHERE id = $1
       RETURNING purchased_slots, free_device_limit`,
      [namespace.id, row.slots],
    )

    const updatedNamespace = namespaceResult.rows[0]
    if (!updatedNamespace) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to update namespace slots')
    }

    await client.query(
      `INSERT INTO unlock_events (namespace_uuid, slots_added, source, unlock_code)
       VALUES ($1, $2, 'code', $3)`,
      [namespace.id, row.slots, normalizedCode],
    )

    await client.query('COMMIT')

    const limits = await loadNamespaceLimits(pool, config, {
      ...namespace,
      free_device_limit: updatedNamespace.free_device_limit,
      purchased_slots: updatedNamespace.purchased_slots,
    })

    return {
      slotsAdded: row.slots,
      purchasedSlots: limits.purchasedSlots,
      maxDevices: limits.maxDevices,
      canAddDevice: canAddDevice(limits),
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export function secureCompareTokens(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}
