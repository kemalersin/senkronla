import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import {
  LIMIT_OVERRIDE_KEYS,
  type LimitOverrideKey,
  type LimitOverrides,
  clampLimitOverrideValue,
  mergeLimitOverrides,
  parseLimitOverrides,
  patchLimitOverridesSchema,
} from '../types/limit-overrides.js'
import { findNamespaceByPublicId } from './namespace-service.js'
import { findAppByPublicId } from './app-registry-service.js'
import { findDeveloperByUuid, loadLimitContext } from './limit-context-loader.js'
import {
  getConfigDefaults,
  resolveEffectiveLimits,
} from './limit-resolution-service.js'
import type { LimitContext } from './limit-resolution-service.js'

type LimitScopeType = 'namespace' | 'app' | 'developer'

function sanitizePatch(patch: LimitOverrides): LimitOverrides {
  const sanitized: LimitOverrides = {}

  for (const key of LIMIT_OVERRIDE_KEYS) {
    const value = patch[key]
    if (value === undefined) {
      continue
    }

    if (value === null) {
      sanitized[key] = null
      continue
    }

    sanitized[key] = clampLimitOverrideValue(key, value)
  }

  return patchLimitOverridesSchema.parse(sanitized)
}

function formatLimitsResponse(ctx: LimitContext, config: ServerConfig) {
  const effective = resolveEffectiveLimits(ctx, config)
  const configDefaults = getConfigDefaults(config)

  return {
    effective: Object.fromEntries(
      LIMIT_OVERRIDE_KEYS.map((key) => [key, effective[key].value]),
    ) as Record<LimitOverrideKey, number>,
    sources: Object.fromEntries(
      LIMIT_OVERRIDE_KEYS.map((key) => [key, effective[key].source]),
    ) as Record<LimitOverrideKey, string>,
    overrides: {
      namespace: parseLimitOverrides(ctx.namespace?.limit_overrides),
      app: parseLimitOverrides(ctx.app?.limit_overrides),
      developer: parseLimitOverrides(ctx.developer?.limit_overrides),
    },
    configDefaults,
  }
}

async function writeAudit(
  pool: DbPool,
  scopeType: LimitScopeType,
  scopeId: string,
  before: LimitOverrides | null,
  after: LimitOverrides | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO operator_limit_audit (scope_type, scope_id, before_overrides, after_overrides)
     VALUES ($1, $2, $3, $4)`,
    [scopeType, scopeId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
  )
}

async function patchScopeOverrides(
  pool: DbPool,
  scopeType: LimitScopeType,
  scopeId: string,
  table: 'namespaces' | 'apps' | 'developers',
  idColumn: string,
  patch: LimitOverrides,
): Promise<LimitOverrides | null> {
  const existing = await pool.query<{ limit_overrides: unknown }>(
    `SELECT limit_overrides FROM ${table} WHERE ${idColumn} = $1`,
    [scopeId],
  )

  const before = parseLimitOverrides(existing.rows[0]?.limit_overrides)
  const merged = mergeLimitOverrides(before, sanitizePatch(patch))

  await pool.query(
    table === 'developers'
      ? `UPDATE ${table} SET limit_overrides = $2 WHERE ${idColumn} = $1`
      : `UPDATE ${table} SET limit_overrides = $2, updated_at = now() WHERE ${idColumn} = $1`,
    [scopeId, merged ? JSON.stringify(merged) : null],
  )

  await writeAudit(pool, scopeType, scopeId, before, merged)

  return merged
}

export async function getNamespaceLimits(
  pool: DbPool,
  config: ServerConfig,
  namespacePublicId: string,
) {
  const namespace = await findNamespaceByPublicId(pool, namespacePublicId)
  if (!namespace) {
    throw new AppError(404, 'NAMESPACE_NOT_FOUND', 'Namespace not found')
  }

  const ctx = await loadLimitContext(pool, { namespace })
  return formatLimitsResponse(ctx, config)
}

export async function patchNamespaceLimits(
  pool: DbPool,
  config: ServerConfig,
  namespacePublicId: string,
  patch: LimitOverrides,
) {
  const namespace = await findNamespaceByPublicId(pool, namespacePublicId)
  if (!namespace) {
    throw new AppError(404, 'NAMESPACE_NOT_FOUND', 'Namespace not found')
  }

  await patchScopeOverrides(pool, 'namespace', namespace.id, 'namespaces', 'id', patch)
  return getNamespaceLimits(pool, config, namespacePublicId)
}

export async function getAppLimits(pool: DbPool, config: ServerConfig, appId: string) {
  const app = await findAppByPublicId(pool, appId)
  if (!app) {
    throw new AppError(403, 'APP_NOT_FOUND', 'Application is not registered')
  }

  const ctx = await loadLimitContext(pool, { app })
  return formatLimitsResponse(ctx, config)
}

export async function patchAppLimits(
  pool: DbPool,
  config: ServerConfig,
  appId: string,
  patch: LimitOverrides,
) {
  const app = await findAppByPublicId(pool, appId)
  if (!app) {
    throw new AppError(403, 'APP_NOT_FOUND', 'Application is not registered')
  }

  await patchScopeOverrides(pool, 'app', app.id, 'apps', 'id', patch)
  return getAppLimits(pool, config, appId)
}

export async function getDeveloperLimits(
  pool: DbPool,
  config: ServerConfig,
  developerId: string,
) {
  const developer = await findDeveloperByUuid(pool, developerId)
  if (!developer) {
    throw new AppError(404, 'NOT_FOUND', 'Developer not found')
  }

  const ctx: LimitContext = { developer }
  return formatLimitsResponse(ctx, config)
}

export async function patchDeveloperLimits(
  pool: DbPool,
  config: ServerConfig,
  developerId: string,
  patch: LimitOverrides,
) {
  const developer = await findDeveloperByUuid(pool, developerId)
  if (!developer) {
    throw new AppError(404, 'NOT_FOUND', 'Developer not found')
  }

  await patchScopeOverrides(pool, 'developer', developer.id, 'developers', 'id', patch)
  return getDeveloperLimits(pool, config, developerId)
}
