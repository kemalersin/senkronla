import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function generateAuthToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyAuthTokenHash(token: string, expectedHash: string): boolean {
  const actual = hashAuthToken(token)
  const actualBuffer = Buffer.from(actual, 'hex')
  const expectedBuffer = Buffer.from(expectedHash, 'hex')

  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}
