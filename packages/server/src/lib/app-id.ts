/** Public application id — `esr_app_` + lowercase slug (letters, digits, underscores). */
export const APP_ID_PATTERN = /^esr_app_[a-z0-9_]+$/

export const APP_ID_VALIDATION_MESSAGE =
  'Must start with esr_app_ and use only lowercase letters, digits, and underscores'

export function normalizeAppId(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidAppId(value: string): boolean {
  return APP_ID_PATTERN.test(normalizeAppId(value))
}
