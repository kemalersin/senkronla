/** Public application id — `esr_app_` + lowercase slug (letters, digits, underscores). */
export const APP_ID_PATTERN = /^esr_app_[a-z0-9_]+$/

export function normalizeAppId(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidAppId(value: string): boolean {
  return APP_ID_PATTERN.test(normalizeAppId(value))
}
