import { isValidNamespaceId } from '@senkronla/protocol'
import type { DocumentAdapter } from './types.js'

export function createDocumentAdapter(opts: {
  namespaceId: string
  namespaceLabel: string
  contentType: string
  exportDocument: () => Promise<unknown>
  importDocument: (data: unknown) => Promise<void>
  encrypt?: boolean
  resolvePassword?: () => Promise<string | undefined>
}): DocumentAdapter {
  if (!isValidNamespaceId(opts.namespaceId)) {
    throw new Error('namespaceId must be a valid UUID v4')
  }

  return {
    buildDocument: async () => JSON.stringify(await opts.exportDocument()),
    importDocument: async (documentJson) => {
      const parsed = JSON.parse(documentJson) as unknown
      await opts.importDocument(parsed)
    },
    contentType: () => opts.contentType,
    encryption: () => ({
      enabled: opts.encrypt ?? false,
      resolvePassword: opts.resolvePassword ?? (async () => undefined),
    }),
    namespaceId: () => opts.namespaceId,
    namespaceLabel: () => opts.namespaceLabel,
  }
}
