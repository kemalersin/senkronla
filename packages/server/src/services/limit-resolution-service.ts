import { deepMerge } from '../config/merge.js'
import { loadEnvOverrides, loadYamlConfig } from '../config/load-config.js'
import type { ServerConfig } from '../config/schema.js'
import { serverConfigSchema } from '../config/schema.js'
import type { LimitOverrideKey, LimitOverrideSource, LimitOverrides } from '../types/limit-overrides.js'
import { LIMIT_OVERRIDE_KEYS } from '../types/limit-overrides.js'
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
  operator?: LimitOverrides | null
}

export interface ResolvedLimitEntry {
  value: number
  source: LimitOverrideSource
}

export type EffectiveLimits = Record<LimitOverrideKey, ResolvedLimitEntry>

export interface LimitBaselines {
  yaml: Record<LimitOverrideKey, number>
  env: Partial<Record<LimitOverrideKey, number>>
}

let runtimeBaselines: LimitBaselines | null = null

export function setRuntimeLimitBaselines(baselines: LimitBaselines): void {
  runtimeBaselines = baselines
}

export function buildLimitBaselines(processEnv: NodeJS.ProcessEnv = process.env): LimitBaselines {
  const yamlConfig = serverConfigSchema.parse(loadYamlConfig(processEnv))
  const envOverrides = loadEnvOverrides(processEnv)
  const envOnlyConfig =
    Object.keys(envOverrides).length > 0
      ? serverConfigSchema.parse(deepMerge({}, envOverrides))
      : null

  const yaml = getConfigDefaults(yamlConfig)
  const envDefaults: Partial<Record<LimitOverrideKey, number>> = {}

  if (envOnlyConfig) {
    const parsedEnvDefaults = getConfigDefaults(envOnlyConfig)
    for (const key of LIMIT_OVERRIDE_KEYS) {
      if (parsedEnvDefaults[key] !== yaml[key]) {
        envDefaults[key] = parsedEnvDefaults[key]
      }
    }
  }

  return { yaml, env: envDefaults }
}

function resolveBaselines(config: ServerConfig, baselines?: LimitBaselines): LimitBaselines {
  if (baselines) {
    return baselines
  }

  if (runtimeBaselines) {
    return runtimeBaselines
  }

  return { yaml: getConfigDefaults(config), env: {} }
}

export function getRuntimeLimitBaselines(config: ServerConfig): LimitBaselines {
  return resolveBaselines(config)
}

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

function resolveBaselineFallback(
  key: LimitOverrideKey,
  config: ServerConfig,
  baselines: LimitBaselines,
): ResolvedLimitEntry {
  const envValue = baselines.env[key]
  if (envValue !== undefined) {
    return { value: envValue, source: 'env' }
  }

  return { value: baselines.yaml[key] ?? getConfigDefault(key, config), source: 'config' }
}

export function resolveLimitKey(
  key: LimitOverrideKey,
  ctx: LimitContext,
  config: ServerConfig,
  baselines?: LimitBaselines,
): ResolvedLimitEntry {
  const resolvedBaselines = resolveBaselines(config, baselines)

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

  const operatorValue = readOverride(ctx.operator, key)
  if (operatorValue !== undefined) {
    return { value: operatorValue, source: 'operator' }
  }

  const rowFallback = getRowFallback(key, ctx)
  if (rowFallback !== undefined) {
    return { value: rowFallback, source: 'row' }
  }

  return resolveBaselineFallback(key, config, resolvedBaselines)
}

export function resolveEffectiveLimits(
  ctx: LimitContext,
  config: ServerConfig,
  baselines?: LimitBaselines,
): EffectiveLimits {
  return {
    recoverPerHour: resolveLimitKey('recoverPerHour', ctx, config, baselines),
    pairingPerHour: resolveLimitKey('pairingPerHour', ctx, config, baselines),
    pairingTokensPerHour: resolveLimitKey('pairingTokensPerHour', ctx, config, baselines),
    pushPerHourPerDevice: resolveLimitKey('pushPerHourPerDevice', ctx, config, baselines),
    namespacesPerDay: resolveLimitKey('namespacesPerDay', ctx, config, baselines),
    freeDeviceLimit: resolveLimitKey('freeDeviceLimit', ctx, config, baselines),
    purchasedSlots: resolveLimitKey('purchasedSlots', ctx, config, baselines),
  }
}

export interface ResolvedRateLimitRule extends RateLimitRule {
  source: LimitOverrideSource
}

export function resolveRateLimitRule(
  action: RateLimitAction,
  ctx: LimitContext,
  config: ServerConfig,
  baselines?: LimitBaselines,
): ResolvedRateLimitRule {
  const key = Object.entries(RATE_LIMIT_KEY_TO_ACTION).find(([, value]) => value === action)?.[0] as
    | LimitOverrideKey
    | undefined

  if (!key) {
    throw new Error(`Unsupported rate limit action for resolution: ${action}`)
  }

  const resolved = resolveLimitKey(key, ctx, config, baselines)

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
  baselines?: LimitBaselines,
): { freeDeviceLimit: number; purchasedSlots: number } {
  return {
    freeDeviceLimit: resolveLimitKey('freeDeviceLimit', ctx, config, baselines).value,
    purchasedSlots: resolveLimitKey('purchasedSlots', ctx, config, baselines).value,
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
