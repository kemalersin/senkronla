import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseEnvelope, verifyEnvelope } from './envelope.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures')

describe('@senkronla/protocol envelope', () => {
  it('parses and verifies a valid raw fixture', () => {
    const raw = readFileSync(join(fixturesDir, 'valid-raw-envelope.json'), 'utf8')
    const envelope = parseEnvelope(JSON.parse(raw))
    const result = verifyEnvelope(envelope, {
      namespaceId: envelope.namespaceId,
      documentId: 'primary',
    })

    expect(result.ok).toBe(true)
  })

  it('parses and verifies a non-primary settings fixture', () => {
    const raw = readFileSync(join(fixturesDir, 'multi-document/valid-settings.json'), 'utf8')
    const envelope = parseEnvelope(JSON.parse(raw))
    expect(envelope.schemaVersion).toBe(2)
    expect(envelope.documentId).toBe('settings')

    const result = verifyEnvelope(envelope, {
      namespaceId: envelope.namespaceId,
      documentId: 'settings',
    })

    expect(result.ok).toBe(true)
  })

  it('rejects sha256 mismatch', () => {
    const raw = readFileSync(join(fixturesDir, 'invalid-sha256-envelope.json'), 'utf8')
    const envelope = parseEnvelope(JSON.parse(raw))
    const result = verifyEnvelope(envelope)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('contentSha256 mismatch')
    }
  })
})
