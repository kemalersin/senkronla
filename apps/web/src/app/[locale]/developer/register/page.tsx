import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { DeveloperPortal } from '@/components/developer-portal'
import { hasDeveloperSessionCookie } from '@/lib/developer-auth'
import { isDeveloperPortalEnabled } from '@/lib/developer-portal-status'

interface PageProps {
  params: Promise<{ locale: string }>
}

export default async function DeveloperRegisterPage({ params }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  if (!(await isDeveloperPortalEnabled())) {
    notFound()
  }

  const hasSessionCookie = await hasDeveloperSessionCookie()

  return <DeveloperPortal initialAuthMode="register" hasSessionCookie={hasSessionCookie} />
}
