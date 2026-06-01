import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'

export function sha256Hex(value: string): string {
  return bytesToHex(sha256(utf8ToBytes(value)))
}
