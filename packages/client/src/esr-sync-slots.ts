import { isValidDocumentId } from '@senkronla/protocol'
import { EsrError } from './errors.js'
import type { DocumentAdapter, EsrSyncConnectOptions, EsrSyncDocumentSlot } from './types.js'

export interface ResolvedDocumentSlot {
  documentId: string
  adapter: DocumentAdapter
}

export function resolveDocumentSlots(options: EsrSyncConnectOptions): ResolvedDocumentSlot[] {
  let raw: EsrSyncDocumentSlot[]

  if (options.documents?.length) {
    raw = options.documents
  } else if (options.document) {
    raw = [{ adapter: options.document }]
  } else {
    throw new EsrError('ESR_CLIENT_NO_DOCUMENT', 'EsrSync.connect requires document or documents')
  }

  const slots = raw.map((slot, index) => {
    const documentId = slot.documentId ?? (index === 0 ? 'primary' : undefined)
    if (!documentId) {
      throw new EsrError(
        'ESR_CLIENT_INVALID_DOCUMENT_SLOT',
        'documentId is required for each entry when using multiple documents',
      )
    }

    if (!isValidDocumentId(documentId)) {
      throw new EsrError('ESR_CLIENT_INVALID_DOCUMENT_ID', `Invalid documentId: ${documentId}`)
    }

    return { documentId, adapter: slot.adapter }
  })

  const seen = new Set<string>()
  for (const slot of slots) {
    if (seen.has(slot.documentId)) {
      throw new EsrError(
        'ESR_CLIENT_DUPLICATE_DOCUMENT_ID',
        `Duplicate documentId in connect options: ${slot.documentId}`,
      )
    }
    seen.add(slot.documentId)
  }

  const namespaceIds = new Set(slots.map((slot) => slot.adapter.namespaceId()))
  if (namespaceIds.size > 1) {
    throw new EsrError(
      'ESR_CLIENT_NAMESPACE_MISMATCH',
      'All document adapters must use the same namespaceId',
    )
  }

  return slots
}
