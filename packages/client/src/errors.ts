export class EsrError extends Error {
  readonly code: string
  readonly status?: number
  readonly details?: unknown

  constructor(code: string, message: string, options?: { status?: number; details?: unknown }) {
    super(message)
    this.name = 'EsrError'
    this.code = code
    this.status = options?.status
    this.details = options?.details
  }
}

export function isEsrError(error: unknown): error is EsrError {
  return error instanceof EsrError
}

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}

export function parseApiError(status: number, body: unknown): EsrError {
  const parsed = body as ApiErrorBody
  const code = parsed.error?.code ?? 'ESR_CLIENT_HTTP_ERROR'
  const message = parsed.error?.message ?? `HTTP ${status}`
  const details = parsed.error?.details

  return new EsrError(code, message, { status, details })
}

export function isOfflineError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true
  }

  if (isEsrError(error) && error.code === 'ESR_CLIENT_OFFLINE') {
    return true
  }

  return false
}
