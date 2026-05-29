import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (error, derived) => {
      if (error) {
        reject(error)
        return
      }

      resolve(derived)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await deriveKey(password, salt)

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }

  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const saltValue = parts[4]
  const expectedValue = parts[5]

  if (!saltValue || !expectedValue || !Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false
  }

  const salt = Buffer.from(saltValue, 'base64url')
  const expected = Buffer.from(expectedValue, 'base64url')

  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, expected.length, { N: n, r, p }, (error, key) => {
      if (error) {
        reject(error)
        return
      }

      resolve(key)
    })
  })

  if (derived.length !== expected.length) {
    return false
  }

  return timingSafeEqual(derived, expected)
}
