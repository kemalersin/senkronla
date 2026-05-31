import type { ServerConfig } from '../config/schema.js'
import type { LimitOverrideKey, LimitOverrideSource, LimitOverrides } from '../types/limit-overrides.js'
import type { AppRow, DeveloperRow, NamespaceRow } from '../types/db.js'
import {
  RATE_LIMIT_ACTION,
  type RateLimitAction,
  type RateLimitRule,
} from './rate-limit-service.js'

export interface LimitContext {
  namespace?: NamespaceRow | null
  app?: AppRow | null
  developer?: DeveloperRow | null
}

export interface ResolvedLimitEntry {
  value: number
  source: LimitOverrideSource
}

export type EffectiveLimits = Record<LimitOverrideKey, ResolvedLimitEntry>

const RATE_LIMIT_KEY_TO_ACTION: Partial<Record<LimitOverrideKey, RateLimitAction>> = {
  recoverPerHour: RATE_LIMIT_ACTION.recover,
  pairingPerHour: RATE_LIMIT_ACTION.pairDevice,
  pairingTokensPerHour: RATE_LIMIT_ACTION.pairingToken,
  pushPerHourPerDevice: RATE_LIMIT_ACTION.putDocument,
  namespacesPerDay: RATE_LIMIT_ACTION.namespaceCreate,
}

const ACTION_WINDOW_SECONDS: Record<string, number> = {
  [RATE_LIMIT_ACTION.recover]: 3600,
  [RATE_LIMIT_ACTION.pairDevice]: 3600,
  [RATE_LIMIT_ACTION.pairingToken]: 3600,
  [RATE_LIMIT_ACTION.putDocument]: 3600,
  [RATE_LIMIT_ACTION.namespaceCreate]: 86_400,
}

function getConfigDefault(key: LimitOverrideKey, config: ServerConfig): number {
  switch (key) {
    case 'recoverPerHour':
      return config.limits.rateLimit.recoverPerHour
    case 'pairingPerHour':
      return config.limits.rateLimit.pairingPerHour
    case 'pairingTokensPerHour':
      return config.limits.rateLimit.pairingTokensPerHour
    case 'pushPerHourPerDevice':
      return config.limits.rateLimit.pushPerHourPerDevice
    case 'namespacesPerDay':
      return config.apps.limits.perApp.namespacesPerDay
    case 'freeDeviceLimit':
      return config.limits.defaultFreeDeviceLimit
    case 'purchasedSlots':
      return 0
  }
}

function getRowFallback(key: LimitOverrideKey, ctx: LimitContext): number | undefined {
  if (!ctx.namespace) {
    return undefined
  }

  if (key === 'freeDeviceLimit') {
    return ctx.namespace.free_device_limit
  }

  if (key === 'purchasedSlots') {
    return ctx.namespace.purchased_slots
  }

  return undefined
}

function readOverride(
  overrides: LimitOverrides | null | undefined,
  key: LimitOverrideKey,
): number | undefined {
  const value = overrides?.[key]
  return typeof value === 'number' ? value : undefined
}

export function resolveLimitKey(
  key: LimitOverrideKey,
  ctx: LimitContext,
  config: ServerConfig,
): ResolvedLimitEntry {
  const namespaceValue = readOverride(ctx.namespace?.limit_overrides as LimitOverrides | null, key)
  if (namespaceValue !== undefined) {
    return { value: namespaceValue, source: 'namespace' }
  }

  const appValue = readOverride(ctx.app?.limit_overrides as LimitOverrides | null, key)
  if (appValue !== undefined) {
    return { value: appValue, source: 'app' }
  }

  const developerValue = readOverride(ctx.developer?.limit_overrides as LimitOverrides | null, key)
  if (developerValue !== undefined) {
    return { value: developerValue, source: 'developer' }
  }

  const rowFallback = getRowFallback(key, ctx)
  if (rowFallback !== undefined) {
    return { value: rowFallback, source: 'row' }
  }

  return { value: getConfigDefault(key, config), source: 'config' }
}

export function resolveEffectiveLimits(ctx: LimitContext, config: ServerConfig): EffectiveLimits {
  return {
    recoverPerHour: resolveLimitKey('recoverPerHour', ctx, config),
    pairingPerHour: resolveLimitKey('pairingPerHour', ctx, config),
    pairingTokensPerHour: resolveLimitKey('pairingTokensPerHour', ctx, config),
    pushPerHourPerDevice: resolveLimitKey('pushPerHourPerDevice', ctx, config),
    namespacesPerDay: resolveLimitKey('namespacesPerDay', ctx, config),
    freeDeviceLimit: resolveLimitKey('freeDeviceLimit', ctx, config),
    purchasedSlots: resolveLimitKey('purchasedSlots', ctx, config),
  }
}

export interface ResolvedRateLimitRule extends RateLimitRule {
  source: LimitOverrideSource
}

export function resolveRateLimitRule(
  action: RateLimitAction,
  ctx: LimitContext,
  config: ServerConfig,
): ResolvedRateLimitRule {
  const key = Object.entries(RATE_LIMIT_KEY_TO_ACTION).find(([, value]) => value === action)?.[0] as
    | LimitOverrideKey
    | undefined

  if (!key) {
    throw new Error(`Unsupported rate limit action for resolution: ${action}`)
  }

  const resolved = resolveLimitKey(key, ctx, config)

  return {
    action,
    limit: resolved.value,
    windowSeconds: ACTION_WINDOW_SECONDS[action] ?? 3600,
    message: `${action} rate limit exceeded`,
    source: resolved.source,
  }
}

export function resolveSlotLimits(
  ctx: LimitContext,
  config: ServerConfig,
): { freeDeviceLimit: number; purchasedSlots: number } {
  return {
    freeDeviceLimit: resolveLimitKey('freeDeviceLimit', ctx, config).value,
    purchasedSlots: resolveLimitKey('purchasedSlots', ctx, config).value,
  }
}

export function getConfigDefaults(config: ServerConfig): Record<LimitOverrideKey, number> {
  return {
    recoverPerHour: getConfigDefault('recoverPerHour', config),
    pairingPerHour: getConfigDefault('pairingPerHour', config),
    pairingTokensPerHour: getConfigDefault('pairingTokensPerHour', config),
    pushPerHourPerDevice: getConfigDefault('pushPerHourPerDevice', config),
    namespacesPerDay: getConfigDefault('namespacesPerDay', config),
    freeDeviceLimit: getConfigDefault('freeDeviceLimit', config),
    purchasedSlots: getConfigDefault('purchasedSlots', config),
  }
}
