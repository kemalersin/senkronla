import type { ServerConfig } from '../config/schema.js'
import type { DbPool, DbQueryable } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'

export interface Limits {
  freeDeviceLimit: number
  purchasedSlots: number
  maxDevices: number
  activeDevices: number
}

export interface LimitsResponse extends Limits {
  canAddDevice: boolean
  onLimitReached?: {
    mode: 'payment' | 'block'
    slotPackages: number[]
  }
}

export async function countActiveDevices(pool: DbQueryable, namespaceUuid: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM devices
     WHERE namespace_uuid = $1 AND revoked_at IS NULL`,
    [namespaceUuid],
  )

  return Number(result.rows[0]?.count ?? 0)
}

export function buildLimits(
  freeDeviceLimit: number,
  purchasedSlots: number,
  activeDevices: number,
): Limits {
  const maxDevices = freeDeviceLimit + purchasedSlots

  return {
    freeDeviceLimit,
    purchasedSlots,
    maxDevices,
    activeDevices,
  }
}

export async function getLimitsForNamespace(
  pool: DbQueryable,
  namespaceUuid: string,
  freeDeviceLimit: number,
  purchasedSlots: number,
): Promise<Limits> {
  const activeDevices = await countActiveDevices(pool, namespaceUuid)
  return buildLimits(freeDeviceLimit, purchasedSlots, activeDevices)
}

export function canAddDevice(limits: Limits): boolean {
  return limits.activeDevices < limits.maxDevices
}

export function assertCanAddDevice(config: ServerConfig, limits: Limits): void {
  if (canAddDevice(limits)) return

  if (config.limits.onLimitReached.mode === 'payment') {
    throw new AppError(403, 'DEVICE_LIMIT_PAYMENT_REQUIRED', 'Device limit reached. Unlock additional slots.', {
      slotPackages: config.limits.onLimitReached.slotPackages,
      maxDevices: limits.maxDevices,
      activeDevices: limits.activeDevices,
    })
  }

  throw new AppError(403, 'DEVICE_LIMIT_BLOCKED', 'Device limit reached. Remove a device to continue.', {
    maxDevices: limits.maxDevices,
    activeDevices: limits.activeDevices,
  })
}

export function buildLimitsResponse(config: ServerConfig, limits: Limits): LimitsResponse {
  const canAdd = canAddDevice(limits)

  return {
    ...limits,
    canAddDevice: canAdd,
    onLimitReached: {
      mode: config.limits.onLimitReached.mode,
      slotPackages: config.limits.onLimitReached.slotPackages,
    },
  }
}
