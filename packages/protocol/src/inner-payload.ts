import { sha256Hex } from './crypto.js'

export const ENV_ENC1_DEFAULT_ITERATIONS = 600_000
export const ENV_ENC1_SALT_BYTES = 16
export const ENV_ENC1_NONCE_BYTES = 12

export interface EnvRaw1Inner {
  magic: 'ENV-RAW1'
  data: string
}

export interface EnvEnc1Inner {
  magic: 'ENV-ENC1'
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  nonce: string
  ciphertext: string
}

export type EnvInnerPayload = EnvRaw1Inner | EnvEnc1Inner

export interface BuildEnvEnc1Options {
  iterations?: number
  salt?: Uint8Array
  nonce?: Uint8Array
}

function getSubtleCrypto(): SubtleCrypto {
  const crypto = globalThis.crypto
  if (!crypto?.subtle) {
    throw new Error('Web Crypto API is not available')
  }
  return crypto.subtle
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + padding)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto()
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations,
    },
    keyMaterial,
    256,
  )

  return subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encryptAesGcm(
  key: CryptoKey,
  nonce: Uint8Array,
  plaintext: string,
): Promise<Uint8Array> {
  const subtle = getSubtleCrypto()
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  )
  return new Uint8Array(ciphertext)
}

async function decryptAesGcm(
  key: CryptoKey,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Promise<string> {
  const subtle = getSubtleCrypto()
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    key,
    ciphertext as BufferSource,
  )
  return new TextDecoder().decode(plaintext)
}

export function buildEnvRaw1Payload(documentJson: string): string {
  const inner: EnvRaw1Inner = {
    magic: 'ENV-RAW1',
    data: documentJson,
  }
  return JSON.stringify(inner)
}

export async function buildEnvEnc1Payload(
  documentJson: string,
  password: string,
  options: BuildEnvEnc1Options = {},
): Promise<string> {
  if (!password) {
    throw new Error('Password is required for ENV-ENC1 payload encryption')
  }

  const iterations = options.iterations ?? ENV_ENC1_DEFAULT_ITERATIONS
  const salt = options.salt ?? randomBytes(ENV_ENC1_SALT_BYTES)
  const nonce = options.nonce ?? randomBytes(ENV_ENC1_NONCE_BYTES)
  const key = await deriveAesKey(password, salt, iterations)
  const ciphertext = await encryptAesGcm(key, nonce, documentJson)

  const inner: EnvEnc1Inner = {
    magic: 'ENV-ENC1',
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64Url(salt),
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(ciphertext),
  }

  return JSON.stringify(inner)
}

export function parseInnerPayload(payload: string): EnvInnerPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    throw new Error('Inner payload is not valid JSON')
  }

  if (!parsed || typeof parsed !== 'object' || !('magic' in parsed)) {
    throw new Error('Inner payload is missing magic field')
  }

  const inner = parsed as Record<string, unknown>
  if (inner.magic === 'ENV-RAW1') {
    if (typeof inner.data !== 'string') {
      throw new Error('ENV-RAW1 payload requires string data field')
    }
    return { magic: 'ENV-RAW1', data: inner.data }
  }

  if (inner.magic === 'ENV-ENC1') {
    if (inner.kdf !== 'PBKDF2-SHA256') {
      throw new Error('Unsupported ENV-ENC1 KDF')
    }
    if (
      typeof inner.iterations !== 'number' ||
      typeof inner.salt !== 'string' ||
      typeof inner.nonce !== 'string' ||
      typeof inner.ciphertext !== 'string'
    ) {
      throw new Error('ENV-ENC1 payload fields are invalid')
    }
    return {
      magic: 'ENV-ENC1',
      kdf: 'PBKDF2-SHA256',
      iterations: inner.iterations,
      salt: inner.salt,
      nonce: inner.nonce,
      ciphertext: inner.ciphertext,
    }
  }

  throw new Error(`Unsupported inner payload magic: ${String(inner.magic)}`)
}

export async function extractDocumentFromInnerPayload(
  payload: string,
  password?: string,
): Promise<string> {
  const inner = parseInnerPayload(payload)

  if (inner.magic === 'ENV-RAW1') {
    return inner.data
  }

  if (!password) {
    throw new Error('Password is required to decrypt ENV-ENC1 payload')
  }

  const key = await deriveAesKey(
    password,
    base64UrlToBytes(inner.salt),
    inner.iterations,
  )
  const documentJson = await decryptAesGcm(
    key,
    base64UrlToBytes(inner.nonce),
    base64UrlToBytes(inner.ciphertext),
  )
  return documentJson
}

export function innerPayloadContentMagic(payload: string): 'ENV-RAW1' | 'ENV-ENC1' {
  return parseInnerPayload(payload).magic
}

export async function buildInnerPayload(
  documentJson: string,
  options: { encrypt?: boolean; password?: string; encOptions?: BuildEnvEnc1Options } = {},
): Promise<{ payload: string; contentMagic: 'ENV-RAW1' | 'ENV-ENC1' }> {
  if (options.encrypt) {
    const payload = await buildEnvEnc1Payload(documentJson, options.password ?? '', options.encOptions)
    return { payload, contentMagic: 'ENV-ENC1' }
  }

  return {
    payload: buildEnvRaw1Payload(documentJson),
    contentMagic: 'ENV-RAW1',
  }
}

export function verifyInnerPayloadSha256(payload: string, contentSha256: string): boolean {
  return sha256Hex(payload) === contentSha256.toLowerCase()
}
