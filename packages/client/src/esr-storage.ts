import type { EsrStorage } from './types.js'

const STORAGE_PREFIX = 'esr'

function scopedKey(key: string): string {
  return `${STORAGE_PREFIX}.${key}`
}

export function createMemoryStorageAdapter(initial: Record<string, string> = {}): EsrStorage {
  const memory = new Map<string, string>(Object.entries(initial))

  return {
    async get(key) {
      return memory.get(scopedKey(key)) ?? null
    },
    async set(key, value) {
      memory.set(scopedKey(key), value)
    },
    async remove(key) {
      memory.delete(scopedKey(key))
    },
  }
}

export function createLocalStorageAdapter(): EsrStorage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new Error('localStorage is not available in this environment')
  }

  const storage = globalThis.localStorage

  return {
    async get(key) {
      return storage.getItem(scopedKey(key))
    },
    async set(key, value) {
      storage.setItem(scopedKey(key), value)
    },
    async remove(key) {
      storage.removeItem(scopedKey(key))
    },
  }
}
