'use client'

import { usePathname } from '@/i18n/navigation'
import { SiteFooter } from '@/components/site-footer'

const DOCS_PATHS = ['/guides', '/sdk', '/api'] as const

export function ConditionalFooter() {
  const pathname = usePathname()

  if (DOCS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return null
  }

  return <SiteFooter />
}
