import { createHash } from 'node:crypto'

/** Non-primary document id used across API reference examples. */
export const API_EXAMPLE_DOCUMENT_ID = 'notes'

/**
 * Example-only sync password used in HTTP/Postman samples.
 * Production apps must use a user-provided or derived secret — never ship this value.
 */
export const API_SAMPLE_SYNC_PASSWORD = 'demo-sync-passphrase'

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Document JSON inside decrypted ENV-ENC1 `data`. */
export const API_SAMPLE_DOCUMENT_JSON = {
  notes: '{"note":"Hello"}',
  notesUpdate: '{"note":"Updated note"}',
  primary: '{"items":[]}',
} as const

/**
 * Deterministic ENV-ENC1 inner payloads for copy-paste API examples.
 * Built with demo-sync-passphrase + fixed salt/nonce (see protocol inner-payload tests).
 */
export const API_SAMPLE_PAYLOADS = {
  notes:
    '{"magic":"ENV-ENC1","kdf":"PBKDF2-SHA256","iterations":600000,"salt":"AQIDBAUGBwgJCgsMDQ4PEA","nonce":"AQIDBAUGBwgJCgsM","ciphertext":"lFyT3p92pT56vOt7b-jCKO0-5mGYLfINAuV0L7gx20o"}',
  notesUpdate:
    '{"magic":"ENV-ENC1","kdf":"PBKDF2-SHA256","iterations":600000,"salt":"AQIDBAUGBwgJCgsMDQ4PEA","nonce":"AQIDBAUGBwgJCgsM","ciphertext":"lFyT3p92pT56of5zYvOFMWQr6v3JyueAqlvGsNk-1KI6vwZRDB-O"}',
  primary:
    '{"magic":"ENV-ENC1","kdf":"PBKDF2-SHA256","iterations":600000,"salt":"AQIDBAUGBwgJCgsMDQ4PEA","nonce":"AQIDBAUGBwgJCgsM","ciphertext":"lFyUxY5-9CZir9Nq-oWz5hHBLmMA33VDBh3jlw"}',
} as const

/** Escape a string for embedding as a JSON string literal in HTTP doc examples. */
export function escapeJsonString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

/** Shared sample values for API docs and Postman artifacts. */
export const API_SAMPLE = {
  namespaceId: '550e8400-e29b-41d4-a716-446655440000',
  namespaceLabel: 'Acme Corp workspace',
  clientDeviceId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  deviceId: '01HZPXDEVICEHOST01',
  guestDeviceId: '01HZPXDEVICEGUEST01',
  guestClientDeviceId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  recoveryClientDeviceId: '9b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e',
  deviceToken: 'dvt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  guestDeviceToken: 'dvt_guest_token_example_9876543210',
  recoveryDeviceToken: 'dvt_recovery_token_example_1122334455',
  recoveryDeviceId: '01HZPXDEVICERECOV01',
  revision: '01HZQXK8Y3V5G2N4M6P7R9S1T',
  notesRevision: '01HZQXNOTESREV01',
  notesRevisionUpdate: '01HZQXNOTESREV02',
  recoverySalt: 'c2FsdC1leGFtcGxlLWJ5dGVz',
  recoveryHash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
  syncPassword: API_SAMPLE_SYNC_PASSWORD,
  contentMagic: 'ENV-ENC1',
  payload: API_SAMPLE_PAYLOADS.notes,
  payloadUpdate: API_SAMPLE_PAYLOADS.notesUpdate,
  payloadPrimary: API_SAMPLE_PAYLOADS.primary,
  contentSha256: sha256Hex(API_SAMPLE_PAYLOADS.notes),
  contentSha256Update: sha256Hex(API_SAMPLE_PAYLOADS.notesUpdate),
  contentSha256Primary: sha256Hex(API_SAMPLE_PAYLOADS.primary),
  sizeBytesNotes: Buffer.byteLength(API_SAMPLE_PAYLOADS.notes, 'utf8'),
  sizeBytesNotesUpdate: Buffer.byteLength(API_SAMPLE_PAYLOADS.notesUpdate, 'utf8'),
  sizeBytesPrimary: Buffer.byteLength(API_SAMPLE_PAYLOADS.primary, 'utf8'),
  writtenAt: '2026-05-28T10:15:00.000Z',
  notesWrittenAt: '2026-05-28T11:00:00.000Z',
  notesWrittenAtUpdate: '2026-05-28T11:05:00.000Z',
  pairingCode: '482913',
  unlockCode: 'UNLK-7X9K-2M4P',
  deviceLabelHost: 'Alice laptop',
  deviceLabelGuest: 'Bob phone',
  deviceLabelRecovery: 'Recovery laptop',
} as const
