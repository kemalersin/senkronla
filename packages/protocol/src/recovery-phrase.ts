import { generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'

export const RECOVERY_SALT_BYTES = 16
export const RECOVERY_HASH_BYTES = 32

/** Normalize whitespace and casing before hashing or validating a recovery phrase */
export function normalizeRecoveryPhrase(phrase: string): string {
  return phrase.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase()
}

/** Generate a BIP39 English 24-word recovery phrase */
export function generateRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 256)
}

export function isValidRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(normalizeRecoveryPhrase(phrase), wordlist)
}
