import { randomBytes, timingSafeEqual } from 'node:crypto'
import {
  isValidRecoveryPhrase,
  normalizeRecoveryPhrase,
  RECOVERY_HASH_BYTES,
  RECOVERY_SALT_BYTES,
} from './recovery-phrase.js'

export {
  generateRecoveryPhrase,
  isValidRecoveryPhrase,
  normalizeRecoveryPhrase,
  RECOVERY_HASH_BYTES,
  RECOVERY_SALT_BYTES,
} from './recovery-phrase.js'

/** argon2id — numeric constant avoids loading native argon2 at module init */
const ARGON2_ID = 2

export const RECOVERY_ARGON2_DEFAULTS = {
  type: ARGON2_ID,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: RECOVERY_HASH_BYTES,
} as const

export interface RecoveryKeyProof {
  salt: string
  hash: string
}

export interface RecoveryArgon2Options {
  memoryCost?: number
  timeCost?: number
  parallelism?: number
  hashLength?: number
}

export interface BuildRecoveryKeyProofOptions {
  salt?: string
  argon2?: RecoveryArgon2Options
}

type Argon2Module = typeof import('argon2')

let argon2Promise: Promise<Argon2Module> | null = null

function loadArgon2(): Promise<Argon2Module> {
  if (!argon2Promise) {
    argon2Promise = import('argon2')
  }
  return argon2Promise
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function resolveArgon2Options(options?: RecoveryArgon2Options) {
  return {
    ...RECOVERY_ARGON2_DEFAULTS,
    ...options,
  }
}

export async function buildRecoveryKeyProof(
  phrase: string,
  options: BuildRecoveryKeyProofOptions = {},
): Promise<RecoveryKeyProof> {
  const normalized = normalizeRecoveryPhrase(phrase)

  if (!isValidRecoveryPhrase(normalized)) {
    throw new Error('Invalid recovery phrase')
  }

  const argon2 = await loadArgon2()
  const argon2Options = resolveArgon2Options(options.argon2)
  const salt = options.salt ? fromBase64Url(options.salt) : randomBytes(RECOVERY_SALT_BYTES)

  if (salt.length !== RECOVERY_SALT_BYTES) {
    throw new Error('Recovery salt must be 16 bytes')
  }

  const hash = await argon2.hash(normalized, {
    ...argon2Options,
    salt,
    raw: true,
  })

  return {
    salt: toBase64Url(salt),
    hash: toBase64Url(Buffer.from(hash)),
  }
}

/** Client-side check that a phrase reproduces the submitted proof */
export async function verifyRecoveryKeyProof(
  phrase: string,
  proof: RecoveryKeyProof,
  options: BuildRecoveryKeyProofOptions = {},
): Promise<boolean> {
  try {
    const recomputed = await buildRecoveryKeyProof(phrase, {
      ...options,
      salt: proof.salt,
    })

    return timingSafeEqual(
      fromBase64Url(recomputed.hash),
      fromBase64Url(proof.hash),
    )
  } catch {
    return false
  }
}

/** Server-side check against stored namespace recovery credentials */
export function verifyStoredRecoveryProof(
  storedSalt: string,
  storedHash: string,
  proof: RecoveryKeyProof,
): boolean {
  if (proof.salt.length !== storedSalt.length || proof.hash.length !== storedHash.length) {
    return false
  }

  try {
    const saltMatch = timingSafeEqual(
      fromBase64Url(proof.salt),
      fromBase64Url(storedSalt),
    )
    const hashMatch = timingSafeEqual(
      fromBase64Url(proof.hash),
      fromBase64Url(storedHash),
    )

    return saltMatch && hashMatch
  } catch {
    return false
  }
}
