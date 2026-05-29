import { createHmac, timingSafeEqual } from 'node:crypto'

export interface DeveloperJwtPayload {
  sub: string
  ver: number
  iat: number
  exp: number
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

function signSegment(secret: string, signingInput: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url')
}

export function signDeveloperJwt(
  secret: string,
  payload: Omit<DeveloperJwtPayload, 'iat' | 'exp'>,
  ttlSeconds: number,
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + ttlSeconds,
    } satisfies DeveloperJwtPayload),
  )
  const signingInput = `${header}.${body}`
  const signature = signSegment(secret, signingInput)

  return `${signingInput}.${signature}`
}

export function verifyDeveloperJwt(secret: string, token: string): DeveloperJwtPayload {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const headerPart = parts[0]
  const payloadPart = parts[1]
  const signaturePart = parts[2]

  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error('Invalid JWT format')
  }

  const signingInput = `${headerPart}.${payloadPart}`
  const expectedSignature = signSegment(secret, signingInput)

  const actual = Buffer.from(signaturePart)
  const expected = Buffer.from(expectedSignature)

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid JWT signature')
  }

  const header = JSON.parse(base64UrlDecode(headerPart).toString('utf8')) as { alg?: string }
  if (header.alg !== 'HS256') {
    throw new Error('Unsupported JWT algorithm')
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf8')) as DeveloperJwtPayload

  if (!payload.sub || typeof payload.ver !== 'number' || typeof payload.exp !== 'number') {
    throw new Error('Invalid JWT payload')
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('JWT expired')
  }

  return payload
}
