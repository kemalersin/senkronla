export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'PAIRING_CODE_INVALID'
  | 'UNAUTHORIZED'
  | 'DEVICE_TOKEN_INVALID'
  | 'FORBIDDEN'
  | 'DEVICE_LIMIT_PAYMENT_REQUIRED'
  | 'DEVICE_LIMIT_BLOCKED'
  | 'LAST_DEVICE_PROTECTED'
  | 'NAMESPACE_NOT_FOUND'
  | 'DEVICE_NOT_FOUND'
  | 'NAMESPACE_EXISTS'
  | 'DOCUMENT_NOT_FOUND'
  | 'INVALID_DOCUMENT_ID'
  | 'DOCUMENT_ID_NOT_ALLOWED'
  | 'DOCUMENT_LIMIT_REACHED'
  | 'ENVELOPE_DOCUMENT_MISMATCH'
  | 'REVISION_CONFLICT'
  | 'ENVELOPE_INVALID'
  | 'ENVELOPE_TOO_LARGE'
  | 'CONTENT_TYPE_NOT_ALLOWED'
  | 'RECOVERY_INVALID'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNLOCK_CODE_INVALID'
  | 'UNLOCK_CODE_ALREADY_REDEEMED'
  | 'ADMIN_API_DISABLED'
  | 'INTERNAL_ERROR'

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
