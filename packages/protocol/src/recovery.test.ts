import { describe, expect, it } from 'vitest'
import {
  buildRecoveryKeyProof,
  generateRecoveryPhrase,
  isValidRecoveryPhrase,
  normalizeRecoveryPhrase,
  verifyRecoveryKeyProof,
  verifyStoredRecoveryProof,
} from './recovery.js'

describe('@senkronla/protocol recovery', () => {
  it('generates a valid 24-word recovery phrase', () => {
    const phrase = generateRecoveryPhrase()
    const words = phrase.split(' ')

    expect(words).toHaveLength(24)
    expect(isValidRecoveryPhrase(phrase)).toBe(true)
  })

  it('normalizes phrase whitespace and casing', () => {
    const phrase = generateRecoveryPhrase()
    const words = phrase.split(' ')
    const firstWord = words[0] ?? ''
    const messy = `  ${firstWord.toUpperCase()}   ${words.slice(1).join('  ')}  `

    expect(normalizeRecoveryPhrase(messy)).toBe(normalizeRecoveryPhrase(phrase))
  })

  it('builds and verifies a recovery key proof round-trip', async () => {
    const phrase = generateRecoveryPhrase()
    const proof = await buildRecoveryKeyProof(phrase)

    expect(proof.salt.length).toBeGreaterThan(0)
    expect(proof.hash.length).toBeGreaterThan(0)
    expect(await verifyRecoveryKeyProof(phrase, proof)).toBe(true)
    expect(await verifyRecoveryKeyProof('invalid phrase words here', proof)).toBe(false)
  })

  it('reproduces the same hash when reusing the original salt', async () => {
    const phrase = generateRecoveryPhrase()
    const initial = await buildRecoveryKeyProof(phrase)
    const replay = await buildRecoveryKeyProof(phrase, { salt: initial.salt })

    expect(replay).toEqual(initial)
    expect(
      verifyStoredRecoveryProof(initial.salt, initial.hash, replay),
    ).toBe(true)
  })

  it('rejects mismatched stored recovery proof', async () => {
    const phrase = generateRecoveryPhrase()
    const proof = await buildRecoveryKeyProof(phrase)
    const other = await buildRecoveryKeyProof(generateRecoveryPhrase())

    expect(verifyStoredRecoveryProof(proof.salt, proof.hash, other)).toBe(false)
  })
})
