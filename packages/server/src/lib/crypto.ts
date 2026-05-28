import { createHash, randomBytes, randomInt } from 'node:crypto'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function generateDeviceToken(): string {
  return `dvt_${randomBytes(32).toString('base64url')}`
}

export function hashDeviceToken(token: string): string {
  return sha256Hex(token)
}

export function generatePairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashPairingCode(code: string, namespaceId: string): string {
  return sha256Hex(`${code.trim()}:${namespaceId}`)
}
