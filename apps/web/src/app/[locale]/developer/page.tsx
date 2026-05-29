import { setRequestLocale } from 'next-intl/server'
import { DeveloperPortal } from '@/components/developer-portal'
import { hasDeveloperSessionCookie } from '@/lib/developer-auth'

interface PageProps {
  params: Promise<{ locale: string }>
}

export default async function DeveloperPage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const hasSessionCookie = await hasDeveloperSessionCookie()

  return <DeveloperPortal initialAuthMode="login" hasSessionCookie={hasSessionCookie} />
}
