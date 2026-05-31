interface FetchJsonResult {
  response: Response
  body: unknown
}

interface DedupedGetOptions {
  cacheMs?: number
}

const inflightGets = new Map<string, Promise<FetchJsonResult>>()
const responseCache = new Map<string, { expiresAt: number; promise: Promise<FetchJsonResult> }>()

export async function fetchJson(url: string, init?: RequestInit): Promise<FetchJsonResult> {
  const response = await fetch(url, init)
  return {
    response,
    body: await response.json(),
  }
}

export function invalidateDedupedGet(url: string) {
  inflightGets.delete(url)
  responseCache.delete(url)
}

/** Coalesce concurrent GET requests for the same URL (e.g. React Strict Mode remount). */
export function dedupedGet(url: string, options: DedupedGetOptions = {}): Promise<FetchJsonResult> {
  const cacheMs = options.cacheMs ?? 0

  if (cacheMs > 0) {
    const cached = responseCache.get(url)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.promise
    }
  }

  const existing = inflightGets.get(url)
  if (existing) {
    return existing
  }

  const promise = fetchJson(url).finally(() => {
    inflightGets.delete(url)
  })

  inflightGets.set(url, promise)

  if (cacheMs > 0) {
    responseCache.set(url, {
      expiresAt: Date.now() + cacheMs,
      promise,
    })
  }

  return promise
}
