const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Validates UUID v4 namespace identifiers per ESR spec */
export function isValidNamespaceId(value: string): boolean {
  return UUID_V4_REGEX.test(value)
}

/** Generate a UUID v4 namespace identifier */
export function generateNamespaceId(): string {
  return globalThis.crypto.randomUUID()
}
