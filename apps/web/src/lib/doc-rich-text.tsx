import type { RichTranslationValues } from 'next-intl'
import { DocTag } from '@/components/doc-tag'

export const docRichText: RichTranslationValues = {
  tag: (chunks) => <DocTag>{chunks}</DocTag>,
}

export function withDocRich(values?: RichTranslationValues): RichTranslationValues {
  return values ? { ...docRichText, ...values } : docRichText
}
