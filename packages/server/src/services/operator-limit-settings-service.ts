import type { ServerConfig } from '../config/schema.js'
import type { DbPool } from '../db/pool.js'
import {
  LIMIT_OVERRIDE_KEYS,
  type LimitOverrideKey,
  type LimitOverrides,
  clampLimitOverrideValue,
  mergeLimitOverrides,
  parseLimitOverrides,
  patchLimitOverridesSchema,
} from '../types/limit-overrides.js'
import {
  type LimitBaselines,
  resolveEffectiveLimits,
} from './limit-resolution-service.js'

export const OPERATOR_LIMITS_SETTINGS_KEY = 'limits'
export const OPERATOR_LIMITS_SCOPE_ID = '00000000-0000-0000-0000-000000000001'

async function loadOperatorLimitOverride(pool: DbPool): Promise<LimitOverrides | null> {
  const result = await pool.query<{ value: unknown }>(
    `SELECT value FROM operator_settings WHERE key = $1`,
    [OPERATOR_LIMITS_SETTINGS_KEY],
  )

  return parseLimitOverrides(result.rows[0]?.value)
}

export async function loadOperatorLimitsIntoContext(pool: DbPool): Promise<LimitOverrides | null> {
  return loadOperatorLimitOverride(pool)
}

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

async function writeOperatorAudit(
  pool: DbPool,
  before: LimitOverrides | null,
  after: LimitOverrides | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO operator_limit_audit (scope_type, scope_id, before_overrides, after_overrides)
     VALUES ('operator', $1, $2, $3)`,
    [
      OPERATOR_LIMITS_SCOPE_ID,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ],
  )
}

export function formatOperatorLimitSettingsResponse(
  config: ServerConfig,
  baselines: LimitBaselines,
  operatorOverride: LimitOverrides | null,
) {
  const effective = resolveEffectiveLimits({ operator: operatorOverride }, config, baselines)

  return {
    effective: Object.fromEntries(
      LIMIT_OVERRIDE_KEYS.map((key) => [key, effective[key].value]),
    ) as Record<LimitOverrideKey, number>,
    sources: Object.fromEntries(
      LIMIT_OVERRIDE_KEYS.map((key) => [key, effective[key].source]),
    ) as Record<LimitOverrideKey, string>,
    overrides: {
      operator: operatorOverride,
    },
    configDefaults: baselines.yaml,
    envDefaults: baselines.env,
    inheritDefaults: Object.fromEntries(
      LIMIT_OVERRIDE_KEYS.map((key) => {
        const withoutOperator = resolveEffectiveLimits({ operator: null }, config, baselines)
        return [key, withoutOperator[key].value]
      }),
    ) as Record<LimitOverrideKey, number>,
  }
}

export async function getOperatorLimitSettings(pool: DbPool, config: ServerConfig, baselines: LimitBaselines) {
  const operatorOverride = await loadOperatorLimitOverride(pool)
  return formatOperatorLimitSettingsResponse(config, baselines, operatorOverride)
}

export async function patchOperatorLimitSettings(
  pool: DbPool,
  config: ServerConfig,
  baselines: LimitBaselines,
  patch: LimitOverrides,
): Promise<ReturnType<typeof getOperatorLimitSettings>> {
  const sanitized = sanitizePatch(patch)
  const existing = await loadOperatorLimitOverride(pool)
  const merged = mergeLimitOverrides(existing, sanitized)

  if (!merged) {
    await pool.query(`DELETE FROM operator_settings WHERE key = $1`, [OPERATOR_LIMITS_SETTINGS_KEY])
  } else {
    await pool.query(
      `INSERT INTO operator_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()`,
      [OPERATOR_LIMITS_SETTINGS_KEY, JSON.stringify(merged)],
    )
  }

  await writeOperatorAudit(pool, existing, merged)

  return getOperatorLimitSettings(pool, config, baselines)
}
