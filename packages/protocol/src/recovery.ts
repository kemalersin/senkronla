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

/** argon2id — numeric constant for shared defaults documentation */
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

type HashWasmModule = typeof import('hash-wasm')

let hashWasmPromise: Promise<HashWasmModule> | null = null

function loadHashWasm(): Promise<HashWasmModule> {
  if (!hashWasmPromise) {
    hashWasmPromise = import('hash-wasm')
  }
  return hashWasmPromise
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }

  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index]! ^ right[index]!
  }

  return diff === 0
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + padding)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
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

  const { argon2id } = await loadHashWasm()
  const argon2Options = resolveArgon2Options(options.argon2)
  const salt = options.salt ? fromBase64Url(options.salt) : randomBytes(RECOVERY_SALT_BYTES)

  if (salt.length !== RECOVERY_SALT_BYTES) {
    throw new Error('Recovery salt must be 16 bytes')
  }

  const hash = await argon2id({
    password: normalized,
    salt,
    parallelism: argon2Options.parallelism,
    iterations: argon2Options.timeCost,
    memorySize: argon2Options.memoryCost,
    hashLength: argon2Options.hashLength,
    outputType: 'binary',
  })

  if (!(hash instanceof Uint8Array)) {
    throw new Error('Unexpected Argon2 output type')
  }

  return {
    salt: toBase64Url(salt),
    hash: toBase64Url(hash),
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
