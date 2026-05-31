import { z } from 'zod'

export const LIMIT_OVERRIDE_KEYS = [
  'recoverPerHour',
  'pairingPerHour',
  'pairingTokensPerHour',
  'pushPerHourPerDevice',
  'namespacesPerDay',
  'freeDeviceLimit',
  'purchasedSlots',
] as const

export type LimitOverrideKey = (typeof LIMIT_OVERRIDE_KEYS)[number]

export type LimitOverrideSource =
  | 'namespace'
  | 'app'
  | 'developer'
  | 'operator'
  | 'row'
  | 'env'
  | 'config'

const positiveInt = z.number().int().positive()
const nonNegativeInt = z.number().int().min(0)

export const limitOverridesSchema = z
  .object({
    recoverPerHour: positiveInt.nullable().optional(),
    pairingPerHour: positiveInt.nullable().optional(),
    pairingTokensPerHour: positiveInt.nullable().optional(),
    pushPerHourPerDevice: positiveInt.nullable().optional(),
    namespacesPerDay: positiveInt.nullable().optional(),
    freeDeviceLimit: nonNegativeInt.nullable().optional(),
    purchasedSlots: nonNegativeInt.nullable().optional(),
  })
  .partial()

export type LimitOverrides = z.infer<typeof limitOverridesSchema>

export const patchLimitOverridesSchema = limitOverridesSchema

export const MAX_LIMIT_OVERRIDE = 10_000

export function clampLimitOverrideValue(key: LimitOverrideKey, value: number): number {
  return Math.min(Math.max(value, 0), MAX_LIMIT_OVERRIDE)
}

export function parseLimitOverrides(raw: unknown): LimitOverrides | null {
  if (raw === null || raw === undefined) {
    return null
  }

  return limitOverridesSchema.parse(raw)
}

export function mergeLimitOverrides(
  existing: LimitOverrides | null,
  patch: LimitOverrides,
): LimitOverrides | null {
  const merged: Record<string, number | null | undefined> = { ...(existing ?? {}) }

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete merged[key]
    } else if (value !== undefined) {
      merged[key] = value
    }
  }

  if (Object.keys(merged).length === 0) {
    return null
  }

  return limitOverridesSchema.parse(merged)
}
