import { z } from 'zod'

/** Document id: lowercase letter first, then [a-z0-9_-], max 64 chars */
export const DOCUMENT_ID_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/

export const DocumentIdSchema = z.string().regex(DOCUMENT_ID_PATTERN, 'Invalid documentId format')

export function isValidDocumentId(documentId: string): boolean {
  return DOCUMENT_ID_PATTERN.test(documentId)
}
