import { describe, expect, it } from 'vitest'
import { signDeveloperJwt, verifyDeveloperJwt } from '../lib/developer-jwt.js'
import { hashPassword, verifyPassword } from '../lib/password-hash.js'

describe('password-hash', () => {
  it('hashes and verifies passwords', async () => {
    const encoded = await hashPassword('secure-password-12')
    expect(await verifyPassword('secure-password-12', encoded)).toBe(true)
    expect(await verifyPassword('wrong-password', encoded)).toBe(false)
  })
})

describe('developer-jwt', () => {
  it('signs and verifies developer tokens', () => {
    const secret = 'x'.repeat(32)
    const token = signDeveloperJwt(secret, { sub: 'dev-uuid', ver: 0 }, 3600)
    const payload = verifyDeveloperJwt(secret, token)

    expect(payload.sub).toBe('dev-uuid')
    expect(payload.ver).toBe(0)
  })
})
