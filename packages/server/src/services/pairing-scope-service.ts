import type { DbPool } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'
import { findAppByPublicId } from './app-registry-service.js'

import { APP_ID_PATTERN, APP_ID_VALIDATION_MESSAGE } from '../lib/app-id.js'
const MAX_ALLOWED_APP_IDS = 10

export async function normalizeAllowedAppIds(
  pool: DbPool,
  allowedAppIds: string[] | undefined,
): Promise<string[] | null> {
  if (!allowedAppIds || allowedAppIds.length === 0) {
    return null
  }

  if (allowedAppIds.length > MAX_ALLOWED_APP_IDS) {
    throw new AppError(400, 'VALIDATION_ERROR', 'allowedAppIds must contain at most 10 entries', {
      fields: [{ path: 'allowedAppIds', message: 'Too many app ids' }],
    })
  }

  const normalized: string[] = []

  for (const rawAppId of allowedAppIds) {
    const appId = rawAppId.trim()
    if (!APP_ID_PATTERN.test(appId)) {
      throw new AppError(400, 'VALIDATION_ERROR', APP_ID_VALIDATION_MESSAGE, {
        fields: [{ path: 'allowedAppIds', message: `Invalid appId: ${rawAppId}` }],
      })
    }

    if (normalized.includes(appId)) {
      continue
    }

    const app = await findAppByPublicId(pool, appId)
    if (!app) {
      throw new AppError(400, 'VALIDATION_ERROR', 'allowedAppIds references unknown application', {
        fields: [{ path: 'allowedAppIds', message: `Unknown appId: ${appId}` }],
      })
    }

    if (app.status !== 'active') {
      throw new AppError(400, 'VALIDATION_ERROR', 'allowedAppIds must reference active applications', {
        fields: [{ path: 'allowedAppIds', message: `App is not active: ${appId}` }],
      })
    }

    normalized.push(appId)
  }

  return normalized
}

export function assertPairingAppAllowed(
  allowedAppIds: string[] | null,
  appId: string | undefined,
): void {
  if (!allowedAppIds || allowedAppIds.length === 0) {
    return
  }

  if (!appId || !allowedAppIds.includes(appId)) {
    throw new AppError(403, 'APP_PAIRING_NOT_ALLOWED', 'Application is not allowed to redeem this pairing code', {
      allowedAppIds,
    })
  }
}
